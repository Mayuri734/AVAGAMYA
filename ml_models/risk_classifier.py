"""
AVAGAMYA ML Risk Classifier
============================
Feature 1: Scikit-learn Random Forest that replaces / benchmarks the
deterministic formula  Risk = (Jargon×15) + (words/5).

This module is intentionally standalone so it can be:
  - trained from the Jupyter notebook  (notebooks/AVAGAMYA_EDA.ipynb)
  - imported by FastAPI                 (main.py  POST /analyze/ml-risk)
  - re-trained on fresh Supabase data at any time

Satisfies JD bullets:
  ✅ Design/develop/deploy ML models
  ✅ Implement ML algorithms with Scikit-learn
  ✅ Support model training, testing, and performance evaluation
  ✅ Feature engineering from large datasets
"""

from __future__ import annotations

import os
import re
import json
import warnings
from pathlib import Path
from typing import List, Tuple, Dict, Optional

import numpy as np
import pandas as pd
import textstat
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
)
from sklearn.preprocessing import LabelEncoder
from sklearn.pipeline import Pipeline

warnings.filterwarnings("ignore")

# ── Paths ────────────────────────────────────────────────────────────────────

MODEL_DIR = Path(__file__).parent
RF_MODEL_PATH  = MODEL_DIR / "risk_rf_model.pkl"
LR_MODEL_PATH  = MODEL_DIR / "risk_lr_model.pkl"
ENCODER_PATH   = MODEL_DIR / "label_encoder.pkl"
METADATA_PATH  = MODEL_DIR / "model_metadata.json"

# ── Jargon vocabulary (mirrors compliance_engine.py) ─────────────────────────

JARGON_LIST = [
    "penalty", "forfeit", "forfeiture", "levy", "late fee", "surcharge",
    "not liable", "no liability", "unlimited liability", "exclusive remedy",
    "indemnify", "indemnification", "hold harmless", "disclaimer",
    "sole discretion", "absolute discretion", "at its discretion",
    "reserve the right", "may refuse", "without notice", "revoke",
    "arbitration", "jurisdiction", "governing law", "breach", "default",
    "binding", "waiver",
]

REGIONAL_RISK_WORDS = [
    "जबाबदार", "दंड", "नुकसानभरपाई", "रद्द", "अस्वीकार",
    "उत्तरदायी", "जुर्माना", "हर्जाना", "शर्तें", "प्रतिबंध",
]


# ── Feature Engineering ──────────────────────────────────────────────────────

def extract_features(clause: str) -> np.ndarray:
    """
    Extract an 11-dimensional feature vector from a single clause string.

    Features:
        0  jargon_count       – number of distinct jargon hits
        1  word_count         – total word count
        2  avg_word_length    – proxy for vocabulary complexity
        3  flesch_score       – reading ease (0=hard, 100=easy)
        4  has_currency       – 1 if ₹ / Rs / INR present
        5  has_percentage     – 1 if % present
        6  has_devanagari     – 1 if Indic script detected
        7  has_regional_risk  – 1 if regional risk keyword found
        8  sentence_length_z  – z-normalised sentence length proxy
        9  unique_word_ratio  – vocabulary richness (unique/total)
        10 exclamation_count  – forceful language marker
    """
    if not clause or not clause.strip():
        return np.zeros(11, dtype=np.float32)

    words = clause.split()
    word_count = max(len(words), 1)
    lower = clause.lower()

    # Jargon count
    jargon_count = sum(1 for j in JARGON_LIST if j in lower)

    # Avg word length
    avg_word_len = np.mean([len(w) for w in words]) if words else 0.0

    # Readability (falls back to 50.0 for Indic scripts)
    is_indic = bool(re.search(r"[\u0900-\u097F]", clause))
    try:
        flesch = textstat.flesch_reading_ease(clause) if not is_indic else 50.0
        flesch = max(0.0, min(100.0, flesch))
    except Exception:
        flesch = 50.0

    has_currency   = 1.0 if re.search(r"[₹]|Rs\.?|INR", clause) else 0.0
    has_percentage = 1.0 if "%" in clause else 0.0
    has_devanagari = 1.0 if is_indic else 0.0
    has_reg_risk   = 1.0 if any(w in clause for w in REGIONAL_RISK_WORDS) else 0.0

    # Sentence length z-score proxy (normalised against typical clause of 20 words)
    sent_len_z = (word_count - 20.0) / 15.0

    # Unique-word ratio (vocabulary richness)
    unique_ratio = len(set(words)) / word_count

    # Exclamation marks (forceful language)
    excl_count = float(clause.count("!"))

    return np.array([
        jargon_count,
        word_count,
        avg_word_len,
        flesch,
        has_currency,
        has_percentage,
        has_devanagari,
        has_reg_risk,
        sent_len_z,
        unique_ratio,
        excl_count,
    ], dtype=np.float32)


FEATURE_NAMES = [
    "jargon_count", "word_count", "avg_word_length", "flesch_score",
    "has_currency", "has_percentage", "has_devanagari", "has_regional_risk",
    "sentence_length_z", "unique_word_ratio", "exclamation_count",
]


def build_feature_matrix(clauses: List[str]) -> np.ndarray:
    """Build (N, 11) feature matrix from a list of clause strings."""
    return np.vstack([extract_features(c) for c in clauses])


# ── Silver-Label Generator (bootstrap without manual annotation) ──────────────

def silver_label(clause: str) -> str:
    """
    Deterministic rule → label mapping used to generate silver labels for
    the training set from historical compliance_logs data.

    Mirrors the thresholds in SymbolicAnalysisEngine.classify_risk() so the
    ML model is trained to reproduce AND improve upon the rule engine.

    Returns: 'LOW' | 'MEDIUM' | 'HIGH'
    """
    lower = clause.lower()
    words = clause.split()
    word_count = len(words)
    jargon_hits = sum(1 for j in JARGON_LIST if j in lower)

    base_score = (jargon_hits * 15) + (word_count / 5.0)
    is_indic = bool(re.search(r"[\u0900-\u097F]", clause))
    if is_indic and jargon_hits > 0:
        base_score += 10.0
    base_score = min(base_score, 100.0)

    if base_score <= 40:
        return "LOW"
    elif base_score <= 70:
        return "MEDIUM"
    else:
        return "HIGH"


# ── Training Pipeline ─────────────────────────────────────────────────────────

def prepare_dataset(
    clauses: List[str],
    labels: Optional[List[str]] = None,
) -> Tuple[np.ndarray, np.ndarray, LabelEncoder]:
    """
    Build X (features) and y (encoded labels).
    If labels is None, silver-label every clause automatically.
    """
    if labels is None:
        labels = [silver_label(c) for c in clauses]

    X = build_feature_matrix(clauses)
    le = LabelEncoder()
    y = le.fit_transform(labels)          # HIGH=0, LOW=1, MEDIUM=2 (sorted alpha)
    return X, y, le


def train_and_evaluate(
    clauses: List[str],
    labels: Optional[List[str]] = None,
    test_size: float = 0.20,
    random_state: int = 42,
) -> Dict:
    """
    Full training + evaluation pipeline.

    Returns a dict with:
        rf_model      – trained RandomForestClassifier
        lr_model      – trained LogisticRegression (baseline)
        label_encoder – fitted LabelEncoder
        metrics       – dict of accuracy, cv_score, classification_report
        feature_importances – dict of feature → importance
    """
    print(f"\n📊 Dataset: {len(clauses)} clauses")
    X, y, le = prepare_dataset(clauses, labels)
    label_dist = pd.Series(le.inverse_transform(y)).value_counts().to_dict()
    print(f"   Label distribution: {label_dist}")

    # ── Train / Test Split ────────────────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )

    # ── Random Forest ─────────────────────────────────────────────────────────
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=random_state,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)
    rf_preds = rf.predict(X_test)
    rf_acc   = accuracy_score(y_test, rf_preds)

    # 5-fold cross-validation
    cv_scores = cross_val_score(rf, X, y, cv=5, scoring="accuracy")

    print(f"\n✅ Random Forest Accuracy: {rf_acc:.4f}")
    print(f"   Cross-Val (5-fold):     {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
    print("\n📋 Classification Report:")
    report_str = classification_report(y_test, rf_preds, target_names=le.classes_)
    print(report_str)
    print("🔲 Confusion Matrix:")
    cm = confusion_matrix(y_test, rf_preds)
    print(pd.DataFrame(cm, index=le.classes_, columns=le.classes_))

    # ── Logistic Regression (baseline) ───────────────────────────────────────
    lr = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=random_state)
    lr.fit(X_train, y_train)
    lr_acc = accuracy_score(y_test, lr.predict(X_test))
    print(f"\n📌 Baseline Logistic Regression Accuracy: {lr_acc:.4f}")
    print(f"   (RF lift over LR: +{(rf_acc - lr_acc)*100:.2f}pp)")

    # ── Feature Importances ───────────────────────────────────────────────────
    importances = dict(zip(FEATURE_NAMES, rf.feature_importances_.tolist()))
    print("\n🔍 Feature Importances (RF):")
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"   {feat:<25} {bar} {imp:.4f}")

    # ── Metadata ──────────────────────────────────────────────────────────────
    metrics = {
        "rf_accuracy":        round(rf_acc, 4),
        "lr_accuracy":        round(lr_acc, 4),
        "cv_mean":            round(cv_scores.mean(), 4),
        "cv_std":             round(cv_scores.std(), 4),
        "train_size":         len(X_train),
        "test_size":          len(X_test),
        "label_distribution": label_dist,
        "classification_report": report_str,
        "feature_importances": importances,
    }

    return {
        "rf_model":          rf,
        "lr_model":          lr,
        "label_encoder":     le,
        "metrics":           metrics,
    }


# ── Model Persistence ─────────────────────────────────────────────────────────

def save_models(rf_model, lr_model, label_encoder, metrics: Dict) -> None:
    """Persist all artefacts to ml_models/ directory."""
    joblib.dump(rf_model,     RF_MODEL_PATH)
    joblib.dump(lr_model,     LR_MODEL_PATH)
    joblib.dump(label_encoder, ENCODER_PATH)

    # Save human-readable metadata
    meta = {
        "model_type":         "RandomForestClassifier",
        "n_features":         11,
        "feature_names":      FEATURE_NAMES,
        "label_classes":      list(label_encoder.classes_),
        "metrics":            {
            k: v for k, v in metrics.items()
            if k not in ("classification_report",)   # skip long string
        },
    }
    METADATA_PATH.write_text(json.dumps(meta, indent=2))
    print(f"\n💾 Models saved → {MODEL_DIR}")


def load_models() -> Tuple[RandomForestClassifier, LabelEncoder]:
    """
    Load RF model + label encoder.  Called once at FastAPI startup.
    Returns (None, None) gracefully if the model hasn't been trained yet.
    """
    if not RF_MODEL_PATH.exists() or not ENCODER_PATH.exists():
        return None, None
    try:
        rf = joblib.load(RF_MODEL_PATH)
        le = joblib.load(ENCODER_PATH)
        return rf, le
    except Exception as e:
        print(f"⚠️  ML model load failed: {e}")
        return None, None


# ── Prediction Helper ─────────────────────────────────────────────────────────

def predict_risk(
    clause: str,
    rf_model: RandomForestClassifier,
    label_encoder: LabelEncoder,
) -> Dict:
    """
    Predict risk level for a single clause.

    Returns:
        {
            "risk_level":   "HIGH" | "MEDIUM" | "LOW",
            "confidence":   0.92,              # max class probability
            "probabilities": {"HIGH": 0.92, "LOW": 0.04, "MEDIUM": 0.04},
            "features":     { ... }            # extracted feature values
        }
    """
    if rf_model is None:
        return {"risk_level": "UNKNOWN", "confidence": 0.0,
                "probabilities": {}, "features": {}, "error": "Model not trained yet"}

    features = extract_features(clause).reshape(1, -1)
    pred_idx  = rf_model.predict(features)[0]
    proba     = rf_model.predict_proba(features)[0]

    risk_level  = label_encoder.inverse_transform([pred_idx])[0]
    confidence  = round(float(proba[pred_idx]), 4)
    proba_dict  = {
        cls: round(float(p), 4)
        for cls, p in zip(label_encoder.classes_, proba)
    }
    feature_vals = dict(zip(FEATURE_NAMES, features[0].tolist()))

    return {
        "risk_level":    risk_level,
        "confidence":    confidence,
        "probabilities": proba_dict,
        "features":      feature_vals,
    }


# ── Synthetic Bootstrap Dataset ───────────────────────────────────────────────

def generate_synthetic_dataset(n: int = 600) -> Tuple[List[str], List[str]]:
    """
    Generate labelled synthetic banking clauses for bootstrapping.
    Labels are attached directly so all 3 risk classes are guaranteed
    to be present. Returns (clauses, labels).
    """
    templates = {
        "HIGH": [
            "The bank reserves the sole discretion to levy a penalty of ₹{amount} for any breach of the agreed terms without prior notice.",
            "Cardholder shall indemnify and hold harmless the bank from any unlimited liability arising out of default or non-payment.",
            "In the event of arbitration, the governing law of jurisdiction shall bind both parties exclusively.",
            "The bank may forfeit the security deposit and revoke account privileges if the borrower defaults on the agreed repayment schedule.",
            "Disclaimer: The bank shall not be liable for any loss arising from sole discretion decisions regarding the waiver of dues.",
            "Any breach of these conditions shall result in forfeiture of all accumulated reward points and imposition of a surcharge.",
            "दंड: ग्राहक को ₹{amount} का जुर्माना देना होगा यदि वह निर्धारित अवधि में भुगतान नहीं करता।",
            "बँक एकट्याच्या विवेकानुसार कोणत्याही क्षणी खाते रद्द करण्याचा अधिकार राखते.",
        ],
        "MEDIUM": [
            "The interest rate applicable shall be {rate}% per annum calculated on a monthly reducing balance basis.",
            "The cardholder is required to pay a minimum due of ₹{amount} by the payment due date each billing cycle.",
            "The bank may at its discretion waive late fee charges if payment is received within {days} days of due date.",
            "Customers are advised that charges may apply for balance enquiry and mini-statement requests at non-home branch ATMs.",
            "The annual fee of ₹{amount} will be levied on the primary card on the anniversary of the card issuance date.",
            "व्याज दर: वार्षिक {rate}% की दर से ब्याज लिया जाएगा यदि भुगतान समय पर नहीं किया गया।",
        ],
        "LOW": [
            "The customer may contact our 24-hour helpline to report a lost or stolen card for immediate blocking.",
            "Please retain a copy of this document for your personal records and future reference.",
            "The bank offers a range of savings and investment products tailored to your financial goals.",
            "Customers can update their registered mobile number by visiting any branch with valid KYC documents.",
            "The minimum balance requirement for this account type is ₹{amount} on a monthly average basis.",
            "You may request a duplicate statement of account by submitting a written request at your home branch.",
            "ग्राहक सेवा केंद्र से संपर्क करके आप अपनी शिकायत दर्ज करा सकते हैं।",
        ],
    }

    amounts = [500, 1000, 2500, 5000, 10000, 25000, 50000]
    rates   = [8.5, 10.0, 12.5, 15.0, 18.0, 24.0, 36.0]
    days    = [3, 5, 7, 10, 15, 30]

    rng = np.random.default_rng(seed=42)
    clauses_out: List[str] = []
    labels_out:  List[str] = []

    per_class = n // 3
    for label, tmps in templates.items():
        for _ in range(per_class):
            tmpl = tmps[rng.integers(len(tmps))]
            clause = (
                tmpl
                .replace("{amount}", str(amounts[rng.integers(len(amounts))]))
                .replace("{rate}",   str(rates[rng.integers(len(rates))]))
                .replace("{days}",   str(days[rng.integers(len(days))]))
            )
            clauses_out.append(clause)
            labels_out.append(label)

    # Shuffle preserving alignment
    idx = rng.permutation(len(clauses_out))
    return [clauses_out[i] for i in idx], [labels_out[i] for i in idx]


# ── CLI Entry Point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  AVAGAMYA ML Risk Classifier -- Training Run")
    print("=" * 60)

    # 1. Generate balanced 3-class bootstrap dataset
    clauses, labels = generate_synthetic_dataset(n=600)
    print(f"Generated {len(clauses)} synthetic clauses (HIGH/MEDIUM/LOW balanced).")

    # 2. Train
    result = train_and_evaluate(clauses, labels=labels)

    # 3. Save
    save_models(
        result["rf_model"],
        result["lr_model"],
        result["label_encoder"],
        result["metrics"],
    )

    # 4. Sanity check
    rf, le = load_models()
    test_clauses = [
        "The bank reserves the sole discretion to levy a penalty of Rs.5000 without notice.",
        "Please retain a copy of this document for your records.",
        "Interest at 18% per annum will be charged on the outstanding balance.",
    ]
    print("\nSanity Predictions:")
    for tc in test_clauses:
        pred = predict_risk(tc, rf, le)
        print(f"  [{pred['risk_level']:6s} | conf={pred['confidence']:.2f}]  {tc[:60]}...")

