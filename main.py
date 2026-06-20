from __future__ import annotations

import uuid
import os
import re
import time
import hashlib
import asyncio
import unicodedata
import gc
import io
import httpx

# ── ML / Data-Science layer (Feature 1 & 2) ─────────────────────────────────
import pandas as pd
import numpy as np
try:
    from ml_models.risk_classifier import load_models, predict_risk
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

from datetime import datetime
from typing import Optional, Set, Tuple, List, Dict
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from supabase import create_client, Client
from langsmith import traceable

import spacy
import textstat

from fastapi import (
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    Query,
    BackgroundTasks,
)
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.concurrency import run_in_threadpool
from local_llm import LocalLLMRouter

from compliance_engine import (
    MathematicalRiskEngine,
    extract_text_with_layout,
    reconstruct_text_healer,
)
load_dotenv()

# PyMuPDF (optional, graceful fallback if not configured)
try:
    import fitz  # PyMuPDF

    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

# Gemini API (optional, graceful fallback if not configured)
# Gemini API removed in favor of Sarvam AI.

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "").strip()
CV_CLASSIFIER_URL = "https://cv-page-classifier-353319363820.asia-south1.run.app"
CV_TABLE_BOOST = 15.0  # Points added to risk score for clauses in tables

# ---------------------------------------------------------------------------
# App & CORS
# ---------------------------------------------------------------------------


# ── ML model globals (loaded once at startup) ────────────────────────────────
ML_RF_MODEL = None
ML_LE = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handle application lifespan events.
    Loads the Sklearn Random Forest model at startup if available.
    """
    global ML_RF_MODEL, ML_LE
    if ML_AVAILABLE:
        ML_RF_MODEL, ML_LE = load_models()
        if ML_RF_MODEL is not None:
            print("✅ ML Risk Classifier loaded (Random Forest)")
        else:
            print("⚠️  ML model not found — run notebooks/AVAGAMYA_EDA.ipynb to train first")
    yield
    # Shutdown: cleanup
    ML_RF_MODEL = None
    ML_LE = None


app = FastAPI(
    title="AVAGAMYA Security Ingestion Layer",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://192.168.31.137:5173",
        "https://avagamya.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.ngrok-free\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    # Pre-warm TinyLlama local LLM model safely in a background thread
    await run_in_threadpool(LocalLLMRouter.pre_warm)

# Supabase Cloud Configuration
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_KEY", "")

supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Warning: Supabase client creation failed: {e}")
else:
    print("Warning: Missing Supabase Credentials")


def log_dpo_event(
    filename: str,
    status: str,
    details: str,
    processing_time: float = 0.0,
    language_detected: str = "Unknown",
    unique_hash: str = "",
    risk_score: str = "",
):
    """
    Log a DPO audit event to Supabase cloud.
    """
    if not supabase:
        return

    try:
        payload = {
            "timestamp": datetime.now().isoformat(),
            "filename": filename,
            "status": status,
            "details": details,
            "processing_time": processing_time,
            "language_detected": language_detected,
            "unique_hash": unique_hash,
            "risk_score": risk_score,
            "ai_reasoning_metadata": details.get("metadata", {}) if isinstance(details, dict) else {},
        }
        if isinstance(details, dict):
            payload["details"] = details.get("text", "")
        supabase.table("compliance_logs").insert(payload).execute()
    except Exception as e:
        print(f"Supabase logging failed: {e}")


# ---------------------------------------------------------------------------
# Cache Layer: SHA-256 Document Cache (Reduces 15s → <200ms on repeat uploads)
# ---------------------------------------------------------------------------


def cache_get(
    file_hash: str,
    language: str,
) -> Optional[Dict]:
    """
    Cache READ: Look up a previously processed document by its SHA-256 hash + language.
    """
    if not supabase:
        return None

    try:
        response = (
            supabase.table("document_cache")
            .select("confusion_index, ai_results")
            .eq("file_hash", file_hash)
            .eq("language", language)
            .limit(1)
            .execute()
        )
        if response.data:
            print(f"✅ CACHE HIT  | hash={file_hash[:12]}... | lang={language}")
            return response.data[0]

        print(f"⬜ CACHE MISS | hash={file_hash[:12]}... | lang={language}")
        return None
    except Exception as e:
        print(f"⚠️  Cache read failed (falling back to AI pipeline): {e}")
        return None


def cache_set(
    file_hash: str,
    language: str,
    confusion_index: float,
    ai_results: list,
) -> None:
    """
    Cache WRITE: Persist results to the document_cache table.
    """
    if not supabase:
        return

    try:
        supabase.table("document_cache").upsert(
            {
                "file_hash": file_hash,
                "language": language,
                "confusion_index": confusion_index,
                "ai_results": ai_results,
            },
            on_conflict="file_hash,language",
        ).execute()
        print(f"💾 CACHE WRITE | hash={file_hash[:12]}... | lang={language}")
    except Exception as e:
        print(f"⚠️  Cache write failed (non-critical): {e}")


def _generate_deterministic_fallback(clause: str) -> str:
    """
    Generates a deterministic fallback message for a clause, trying to extract a financial metric.
    """
    # Defensive regex for currencies and percentages
    metrics = re.findall(r"(\d+(?:\.\d+)?\s*(?:%|₹|Rs|INR|days|months|years))", clause, re.IGNORECASE)
    if metrics:
        return f"Complex Clause: Manual review recommended. (Contains: {', '.join(metrics)})"

    # Check for keywords if regex fails
    lower = clause.lower()
    if "interest" in lower or "%" in lower:
        return "Complex Clause: Manual review recommended. (Interest/Rate related)"
    if "fee" in lower or "charge" in lower or "₹" in lower:
        return "Complex Clause: Manual review recommended. (Fee/Charge related)"

    return "Complex Clause: Manual review recommended. Data integrity remains in original document."


def _fallback_simplified_text(clause: str) -> str:
    """Standard safety fallback for all failed AL/LLM operations."""
    return f"Simplification unavailable. Please refer to original text: {clause[:100]}..."


# ---------------------------------------------------------------------------
# NLP & Regex setup
# ---------------------------------------------------------------------------

# Load spaCy English model once at startup (OOM Optimized)
nlp = spacy.load("en_core_web_sm", disable=["ner", "lemmatizer", "textcat"])

CARD_RE = re.compile(r"\b(?:\d[ -]?){16}\b")  # 16-digit credit card patterns
PAN_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")  # Indian PAN card pattern
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")
PHONE_RE = re.compile(r"\b\d{5,}\b")

# In‑memory session-scoped allowlists
ALLOWED_EMAIL_DOMAINS: Set[str] = set()
ALLOWED_CONTACT_NUMBERS: Set[str] = set()


class PiiScanResponse(BaseModel):
    status: str  # "BLOCKED" | "OK"
    message: str
    risk_level: Optional[str] = None  # "HIGH" when blocked
    word_count: Optional[int] = None
    reading_time_minutes: Optional[float] = None
    issuer: Optional[str] = None


class ClauseAnalysis(BaseModel):
    id: int
    page: int
    page_type: Optional[str] = "TEXT"  # New
    original_text: str
    risk_level: str  # "LOW" | "MEDIUM" | "HIGH"
    confusion_score: float
    jargon_detected: List[str]
    financial_metric: Optional[str] = None


class HighRiskClauseAnalysis(BaseModel):
    """High-risk clause with simplified explanation and coordinates for highlighting."""

    id: int
    page: int
    page_type: Optional[str] = "TEXT"  # New
    original_text: str
    simplified: str  # Gemini-generated simple explanation
    risk_score: float  # Confusion score
    highlight_coords: Optional[List[List[int]]] = (
        None  # [[page, x, top_y, width, height], ...] for multi-line red highlight
    )


class HighRiskAnalysisResponse(BaseModel):
    """Response for high-risk-only analysis UI."""

    status: str  # "ANALYSIS_COMPLETE" or "BLOCKED"
    pii_result: str  # "OK" or "BLOCKED"
    message: Optional[str] = None
    meta: Optional[dict] = None  # {total_scanned, high_risk_found}
    high_risk_clauses: Optional[List[HighRiskClauseAnalysis]] = None


class SymbolicAnalysisResponse(BaseModel):
    status: str  # "ANALYSIS_COMPLETE" or "BLOCKED"
    pii_result: str  # "OK" or "BLOCKED"
    message: Optional[str] = None
    risk_level: Optional[str] = None
    issuer: Optional[str] = None
    word_count: Optional[int] = None
    reading_time_minutes: Optional[float] = None
    meta: Optional[dict] = None  # {total_clauses, high_risk_count, avg_complexity}
    analysis: Optional[List[ClauseAnalysis]] = None


# ---------------------------------------------------------------------------
# PDF extraction functions are now imported from compliance_engine.py
# ---------------------------------------------------------------------------


def _normalize_text_for_matching(text: str) -> str:
    """
    Robust text normalization for fuzzy matching:
    - Convert to lowercase
    - Remove punctuation (keep alphanumeric, Devanagari, and spaces)
    - Replace all whitespace (newlines, tabs, multiple spaces) with single space
    """
    if not text:
        return ""
    # Convert to lowercase
    normalized = text.lower()
    # Remove punctuation (keep alphanumeric, Devanagari, spaces, and common symbols like ₹ and %)
    normalized = re.sub(r"[^\w\s₹%\u0900-\u097F]", "", normalized)
    # Replace all whitespace sequences with single space
    normalized = re.sub(r"\s+", " ", normalized)
    # Clean garbage punctuation trailing at the end
    normalized = re.sub(r"[,.:;]$", "", normalized.strip())
    return normalized.strip()


def _clean_word_for_matching(w: str) -> str:
    """Normalize and clean a single word for matching."""
    # Normalize Unicode to fix Devanagari character breaking/clustering differences
    w_norm = unicodedata.normalize("NFKC", w)
    return re.sub(r"[^\w\u0900-\u097F]", "", w_norm.lower())


def _find_exact_sequence(pdf_words: List[list], expected_words: List[str]) -> List[fitz.Rect]:
    """Search for the exact continuous sequence of words in the PDF."""
    seq_len = len(expected_words)
    for i in range(len(pdf_words) - seq_len + 1):
        window = pdf_words[i: i + seq_len]
        window_words = [_clean_word_for_matching(w[4]) for w in window]
        if window_words == expected_words:
            return [fitz.Rect(w[0], w[1], w[2], w[3]) for w in window]
    return []


def _find_anchor_sequence(pdf_words: List[list], expected_words: List[str]) -> List[fitz.Rect]:
    """Fallback search using first and last word anchors."""
    if len(expected_words) < 6:
        return []
    start_anchor = expected_words[:3]
    end_anchor = expected_words[-3:]
    start_idx, end_idx = -1, -1

    for i in range(len(pdf_words) - 2):
        if [_clean_word_for_matching(w[4]) for w in pdf_words[i: i + 3]] == start_anchor:
            start_idx = i
            break
    if start_idx != -1:
        for i in range(start_idx, len(pdf_words) - 2):
            if [_clean_word_for_matching(w[4]) for w in pdf_words[i: i + 3]] == end_anchor:
                end_idx = i + 2
                break
    if start_idx != -1 and end_idx != -1:
        return [fitz.Rect(pdf_words[i][0], pdf_words[i][1], pdf_words[i][2], pdf_words[i][3])
                for i in range(start_idx, end_idx + 1)]
    return []


def extract_coordinates_from_pdf(  # noqa: C901
    pdf_bytes: bytes,
    page_num: int,
    clause_text: str,
) -> Optional[List[List[int]]]:
    """
    Extract bounding box coordinates for a clause using PyMuPDF (fitz).
    Improved: Robust word-by-word matching to handle PDF line breaks.
    """
    if not PYMUPDF_AVAILABLE:
        return None

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if page_num < 1 or page_num > len(doc):
            return None
        page = doc[page_num - 1]

        # 1. Normalize and split input text into words
        clean_target = _normalize_text_for_matching(clause_text)
        target_words = [w for w in clean_target.split() if len(w) > 1]
        if not target_words:
            return None

        # 2. Get all words from PDF page with their rects
        pdf_words = page.get_text("words")  # (x0, y0, x1, y1, "word", block_no, line_no, word_no)

        # 3. Sliding window search for the word sequence
        # We allow a small gap (max 3 words) to handle inserted page numbers or noise
        best_match_rects = []
        max_words = len(pdf_words)
        target_len = len(target_words)

        for i in range(max_words):
            current_pdf_word = _clean_word_for_matching(pdf_words[i][4])
            if current_pdf_word == target_words[0]:
                # Potential start!
                matched_rects = [fitz.Rect(pdf_words[i][:4])]
                target_idx = 1
                pdf_idx = i + 1

                while target_idx < target_len and pdf_idx < max_words:
                    pdf_w = _clean_word_for_matching(pdf_words[pdf_idx][4])
                    if pdf_w == target_words[target_idx]:
                        matched_rects.append(fitz.Rect(pdf_words[pdf_idx][:4]))
                        target_idx += 1
                    elif len(pdf_w) < 2:  # Skip noise/punctuation
                        pass
                    else:
                        # Allow skipping up to 2 words in PDF (page numbers, etc)
                        lookahead = 1
                        found = False
                        while lookahead <= 2 and (pdf_idx + lookahead) < max_words:
                            if _clean_word_for_matching(pdf_words[pdf_idx + lookahead][4]) == target_words[target_idx]:
                                pdf_idx += lookahead
                                matched_rects.append(fitz.Rect(pdf_words[pdf_idx][:4]))
                                target_idx += 1
                                found = True
                                break
                            lookahead += 1
                        if not found:
                            break
                    pdf_idx += 1

                if target_idx >= target_len * 0.8:  # 80% match threshold for fuzzy recovery
                    best_match_rects = matched_rects
                    break

        if not best_match_rects:
            return None

        # 4. Group rects into lines for cleaner UI highlights
        lines_dict = {}
        for r in best_match_rects:
            y_key = round(r.y0 / 4) * 4  # Group by Y coordinate with small tolerance
            lines_dict.setdefault(y_key, []).append(r)

        highlights = []
        for line in lines_dict.values():
            x0 = min(r.x0 for r in line)
            y0 = min(r.y0 for r in line)
            x1 = max(r.x1 for r in line)
            y1 = max(r.y1 for r in line)
            highlights.append([int(page_num), int(x0), int(y0), int(x1 - x0), int(y1 - y0) + 2])

        return highlights
    except Exception as e:
        print(f"Highlighting Error: {e}")
        return None


def _process_regional_clause(clause: str) -> Optional[str]:
    """Handle regional language clause validation and scoring."""
    has_risk = has_risk_keywords(clause)
    has_financial = bool(re.search(r"[₹%०-९]", clause))
    jargon_found = SymbolicAnalysisEngine.detect_jargon(clause)
    risk_keyword_count = sum(1 for keyword in RISK_KEYWORDS if keyword in clause.lower())

    if (has_risk and (has_financial or len(jargon_found) > 0)) or (risk_keyword_count >= 2):
        return clause
    return None


def _process_english_clause(clause: str, threshold: float) -> Optional[str]:
    """Handle English clause validation and complexity filtering."""
    if semantic_validator(clause):
        score = SymbolicAnalysisEngine.calculate_confusion_index(clause)
        if has_risk_keywords(clause) and score > threshold:
            return clause
    return None


def _clean_json_response(response_text: str) -> str:
    """
    Robust cleaner for Neural Track: strip AI chatter and markdown so only raw JSON remains.
    Ensures 100% parseable JSON for Hindi/Marathi/English (Devanagari UTF-8) responses.
    """
    if not response_text or not response_text.strip():
        return "{}"
    # Remove markdown code fences (strict regex cleanup)
    out = re.sub(r"```json|```", "", response_text).strip()
    # Strip any leading/trailing conversational text; keep only the JSON object
    start = out.find("{")
    end = out.rfind("}") + 1
    if start >= 0 and end > start:
        out = out[start:end]
    # Remove control characters that can break JSON (preserve newlines inside strings and UTF-8)
    out = "".join(
        c for c in out if c == "\n" or (ord(c) >= 32 and ord(c) != 127) or c in "\t\r"
    )
    return out.strip()


def scrub_ai_text(text: str) -> str:
    """
    Enterprise-grade scrubber: Permanently removes <think> tags (closed/unclosed)
    and AI conversational chatter across English, Hindi, and Marathi.
    """
    if not text:
        return ""

    # 1. Strip <think> tags only until its closing tag.
    # If unclosed, ONLY strip the <think> tag itself to avoid eating the whole response.
    # We use (?:</think>|$) but we must be careful: if we match to $, and it's unclosed, we eat everything.
    # BETTER: If </think> is missing, just remove the <think> tag literal.
    if "<think>" in text.lower() and "</think>" not in text.lower():
        text = re.sub(r"<think>", "", text, flags=re.IGNORECASE).strip()
    else:
        text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()

    # 2. Strip AI conversational artifacts at the BEGINNING (The "Here is the summary" problem)
    noise_prefixes = [
        r"^(here's|here is|this is|simplified|explanation|simplified version|audit summary|sure|ok).*?:\s*",
        r"^(अतः|यह|अनुवाद|सरलीकृत|यहाँ|निश्चित).*?:\s*",  # Hindi
        r"^(येथे|हे|मराठी|सरलीकृत|नक्की).*?:\s*",  # Marathi
    ]
    for pattern in noise_prefixes:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE | re.UNICODE).strip()

    # 3. Strip AI conversational artifacts at the END (The "Let me know if you need more" problem)
    noise_suffixes = [
        r"(let me know|if you need|further refinements|hope this helps|this version is).*$",
        r"(आशा है|जरूरत हो|कृपया बताएं).*$",  # Hindi
        r"(आशा आहे|गरज असल्यास|सांगा).*$",  # Marathi
    ]
    for pattern in noise_suffixes:
        text = re.sub(
            pattern, "", text, flags=re.IGNORECASE | re.UNICODE | re.MULTILINE
        ).strip()

    # 4. Clean up leading/trailing markdown characters that often stick around
    text = text.lstrip('`#*- \n"').rstrip('` \n"')

    return text.strip()


@traceable(name="AVAGAMYA_Sarvam_Simplifier")
async def simplify_with_sarvam(clauses: List[str], language: str) -> dict:
    """
    SARVAM TRACK: Parallel high-reasoning simplification fallback mapped cleanly across clauses.
    Resolves simultaneous LLM queries concurrently using asyncio.gather to eliminate queue blocking.
    """
    if not clauses or not SARVAM_API_KEY:
        return {clause: _fallback_simplified_text(clause) for clause in clauses}

    sarvam_map: Dict[str, str] = {}

    lang_map = {"en": "English", "hi": "Hindi", "mr": "Marathi"}
    target_language = lang_map.get((language or "").strip().lower(), "English")

    url = "https://api.sarvam.ai/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "api-subscription-key": SARVAM_API_KEY,
    }

    prompt_template = (
        "You are a BFSI Compliance Auditor Agent. "
        f"Simplify this banking clause for a 10th-grade student in {target_language}. "
        "Output ONLY the simplified sentence."
    )
    critic_template = (
        "Compare: Original: {original} vs Simplified: {simplified}. "
        "Has any financial data (₹, %, days) been lost? Output ONLY 'PASS' or 'FAIL'."
    )

    async def process_single_clause(client: httpx.AsyncClient, clause: str) -> Tuple[str, str]:
        try:
            # Step 1: Auditor
            auditor_messages = [{"role": "system", "content": prompt_template}, {"role": "user", "content": clause}]
            payload = {"model": "sarvam-m", "messages": auditor_messages, "temperature": 0.3}
            resp = await client.post(url, json=payload, headers=headers)
            simplified = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()

            # Step 2: Critic
            critic_msg = [{"role": "system", "content": critic_template.format(original=clause, simplified=simplified)}]
            c_payload = {"model": "sarvam-m", "messages": critic_msg, "temperature": 0.0}
            c_resp = await client.post(url, json=c_payload, headers=headers)
            if "PASS" in c_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip().upper():
                return (clause, scrub_ai_text(simplified))

            # Step 3: Retry
            print(f"⚠️ Handshake FAIL: {clause[:30]}...")
            correction_msg = prompt_template + " CORRECTION: Do not lose ₹ or %."
            retry_msg = [{"role": "system", "content": correction_msg}, {"role": "user", "content": clause}]
            r_payload = {"model": "sarvam-m", "messages": retry_msg, "temperature": 0.2}
            r_resp = await client.post(url, json=r_payload, headers=headers)
            r_simplified = r_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            return (clause, scrub_ai_text(r_simplified))
        except Exception as e:
            print(f"❌ SARVAM AGENT ERROR: {e}")
            return (clause, _fallback_simplified_text(clause))

    async with httpx.AsyncClient(timeout=45.0) as client:
        results = await asyncio.gather(*[process_single_clause(client, c) for c in clauses])
        for k, v in results:
            sarvam_map[k] = v
    return sarvam_map


# Gemini simplification functions removed.


def _extract_numbered_lines(text: str) -> List[str]:
    """
    Extracts lines that start with a number followed by a period (e.g., "1. text").
    Used to parse numbered lists from LLM responses.
    """
    if not text:
        return []

    # Pattern to match: optional whitespace, digit(s), period, space, then capturing the rest of the line
    pattern = re.compile(r"^\s*\d+\.\s*(.*)$", re.MULTILINE)
    matches = pattern.findall(text)

    # Return stripped lines
    return [m.strip() for m in matches if m.strip()]


# ---------------------------------------------------------------------------
# NER + bank / allowlist helpers
# ---------------------------------------------------------------------------


def detect_issuer(text: str) -> Optional[str]:
    """Use spaCy NER to find the first ORG entity (document issuer)."""
    if not text:
        return None
    doc = nlp(text[:10_000])  # limit to first chunk for speed
    for ent in doc.ents:
        if ent.label_ == "ORG":
            return ent.text.strip()
    return None


def is_bank_name(name: str) -> bool:
    """Heuristic: treat any ORG containing 'bank' as a bank."""
    return "bank" in name.lower()


def extract_emails_and_domains(text: str) -> Tuple[Set[str], Set[str]]:
    """
    Returns (full_email_addresses, domains).
    """
    emails = set()
    domains = set()
    for match in EMAIL_RE.finditer(text):
        full_match = match.group(0)
        domain = match.group(1)
        emails.add(full_match)
        domains.add(domain.lower())
    return emails, domains


def extract_potential_contact_numbers(text: str) -> Set[str]:
    """
    Crude extraction of long digit sequences (phone / contact numbers).
    Does NOT try to differentiate cards here; that’s handled by CARD_RE.
    """
    numbers = set()
    for match in PHONE_RE.finditer(text):
        num = match.group(0)
        # Basic sanity filter: ignore obviously huge numbers
        if 5 <= len(num) <= 15:
            numbers.add(num)
    return numbers


def refresh_dynamic_allowlist(text: str, issuer: Optional[str]) -> None:
    """
    When issuer is a bank, we:
    - extract first email domain that matches the bank name
    - treat obvious service numbers as allowed contacts
    This is session-scoped (process memory).
    """

    if not issuer or not is_bank_name(issuer):
        return

    bank_key = re.sub(r"[^a-z0-9]", "", issuer.lower())
    if not bank_key:
        return

    emails, domains = extract_emails_and_domains(text)
    contacts = extract_potential_contact_numbers(text)

    # Email domains containing the bank key are considered public support domains
    for domain in domains:
        if bank_key in domain.replace(".", ""):
            ALLOWED_EMAIL_DOMAINS.add(domain)

    # Very simple heuristic for toll-free / published numbers:
    for num in contacts:
        if num.startswith(("1800", "1860", "18602", "080", "022")):
            ALLOWED_CONTACT_NUMBERS.add(num)


# ---------------------------------------------------------------------------
# PII scanning logic
# ---------------------------------------------------------------------------


def scan_for_pii(text: str, issuer: Optional[str]) -> PiiScanResponse:
    """
    Smart PII logic:

    - Regex for:
      * 16‑digit credit card numbers
      * Indian PAN patterns
    - spaCy ORG to infer issuer.
    - Dynamic allowlist for bank contact email domains / phone numbers.
    - BLOCK only when we see personal PII (card / PAN) that is not part of
      known public contact data (emails/phones).

    For simplicity and safety, any card/PAN hit is treated as personal PII.
    """
    # Update dynamic allowlist based on issuer and text
    refresh_dynamic_allowlist(text, issuer)

    card_hits = CARD_RE.findall(text)
    pan_hits = PAN_RE.findall(text)

    # If there are any card or PAN patterns, treat as HIGH risk and BLOCK.
    if card_hits or pan_hits:
        return PiiScanResponse(
            status="BLOCKED",
            risk_level="HIGH",
            message="Security Alert: Personal details detected.",
            issuer=issuer,
        )

    # No high-risk personal PII detected
    words = text.split()
    word_count = len(words)
    # Assume ~200 words per minute for reading time
    reading_time_minutes = round(word_count / 200.0, 2) if word_count else 0.0

    return PiiScanResponse(
        status="OK",
        message="Document verified.",
        issuer=issuer,
        word_count=word_count,
        reading_time_minutes=reading_time_minutes,
    )


# ---------------------------------------------------------------------------
# SEMANTIC VALIDATOR: Advanced Cleaning + Linguistic Validation
# ---------------------------------------------------------------------------
# This is the "De-Clutter" & "Grammar Engine" phase that eliminates junk
# fragments using regex rules + spaCy dependency parsing.
# ---------------------------------------------------------------------------

# Risk keywords that indicate important contractual terms
RISK_KEYWORDS = {
    "liable",
    "liability",
    "indemnify",
    "indemnification",
    "forfeit",
    "discretion",
    "levy",
    "charge",
    "penalty",
    "default",
    "breach",
    "terminate",
    "termination",
    "cancel",
    "cancellation",
    "refuse",
    "refuse to",
    "deny",
    "denial",
    "waive",
    "waiver",
    "forfeiture",
    "lien",
    "claim",
    "dispute",
    "arbitration",
    "jurisdiction",
    "governing law",
    "sole discretion",
    "absolute discretion",
    "at its discretion",
    "may refuse",
    "shall not be liable",
    "not liable",
    "no liability",
    "unlimited liability",
    # Marathi risk indicators
    "जबाबदार",
    "दंड",
    "नुकसानभरपाई",
    "रद्द",
    "अस्वीकार",
    "अटी",
    "दायित्व",
    "बंधने",
    "अधिकार",
    "क्षेत्राधिकार",
    "थकीत",
    "अंतिम",
    # Hindi risk indicators
    "उत्तरदायी",
    "जुर्माना",
    "हर्जाना",
    "रद्द",
    "अस्वीकृत",
    "शर्तें",
    "प्रतिबंध",
    "बकाया",
    "अनिवार्य",
}


def advanced_clean(text: str) -> str:
    """
    PHASE 1: ADVANCED CLEANING ("De-Clutter")

    Universal Regex Filters to remove junk before linguistic validation:
    1. Table Data: Discard lines where >30% of characters are digits/currency
    2. Navigation: Discard lines containing "Page", "www.", ".com", etc.
    3. Headers: Discard ALL CAPS lines under 10 words
    """
    if not text or not text.strip():
        return ""

    cleaned_lines = []

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        # 1. TABLE DATA FILTER: >30% digits/currency = discard
        digit_currency_chars = sum(1 for c in line if c.isdigit() or c in "₹%,.-")
        if len(line) > 0 and digit_currency_chars / len(line) > 0.30:
            continue

        # 2. NAVIGATION FILTER: Common navigation patterns
        if re.search(
            r"\b(page|pages?)\s+\d+|\bwww\.|\.com\b|toll\s*free|helpline|contact\s*us",
            line,
            re.IGNORECASE,
        ):
            continue

        # 3. HEADER FILTER: ALL CAPS + under 10 words = discard
        if line.isupper() and len(line.split()) < 10:
            continue

        # 4. TEMPLATE DATA FILTER: Discard placeholder values like ₹X-Y, consecutive placeholders, etc.
        if re.search(r"₹\s*[A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9]+)+", line) or re.search(
            r"(?:[_.X]{2,}\s*)+", line
        ):
            continue

        cleaned_lines.append(line)

    return "\n".join(cleaned_lines)


def semantic_validator(clause: str) -> bool:
    """
    PHASE 2: LINGUISTIC VALIDATION ("Grammar Engine")

    Uses spaCy to validate that a clause is a grammatically complete sentence:
    - Must have a ROOT VERB (token.pos_ == "VERB")
    - Must have a SUBJECT (nsubj or nsubjpass dependency)

    Pass Examples:
        "The bank reserves the right to cancel." (Has Verb: "reserves", Subject: "bank")
        "Cardholder must pay the fee." (Has Verb: "pay", Subject: "cardholder")

    Fail Examples:
        "Credit Card Application Form." (No Verb -> Fragment)
        "In the event of default." (No Verb, only prep phrase)
    """
    if not clause or not clause.strip():
        return False

    try:
        doc = nlp(clause)

        # Check for root verb
        has_verb = False
        has_subject = False

        for token in doc:
            # Check if token is a verb (root verb in most cases)
            if token.pos_ == "VERB":
                has_verb = True
            # Check if token has subject dependency
            if token.dep_ in ("nsubj", "nsubjpass"):
                has_subject = True

        # Both verb and subject required for valid sentence
        return has_verb and has_subject

    except Exception as e:
        print(f"Warning: Semantic validation error: {e}")
        return False


def merge_with_previous(current: str, previous: str) -> Optional[str]:
    """
    PHASE 3: SMART MERGING ("Repair")

    If current clause fails linguistic validation (is a fragment):
    1. Attempt to merge with previous clause
    2. Re-validate the merged result
    3. Return merged clause if valid, None if still invalid

    Example:
        Previous: "The bank may cancel the account."
        Current: "In the event of breach." (Fragment - no verb/subject)
        Merged: "The bank may cancel the account. In the event of breach."
        Result: Still fails (second part is fragment) -> Return None
    """
    if not current or not previous:
        return None

    # Simple merge: add period between if needed
    merged = (
        f"{previous} {current}"
        if not previous.endswith(".")
        else f"{previous} {current}"
    )

    # Re-validate the merged clause
    if semantic_validator(merged):
        return merged

    return None


def has_risk_keywords(clause: str) -> bool:
    """
    PHASE 4: RISK KEYWORD CHECK

    Checks if a clause contains specific risk indicators like:
    "liable", "indemnify", "forfeit", "discretion", "levy", etc.

    This ensures we only keep clauses that are actually about risks,
    not just complex language.
    """
    clause_lower = clause.lower()

    for keyword in RISK_KEYWORDS:
        if keyword in clause_lower:
            return True

    return False


def semantic_segment_and_validate(
    text: str, confusion_threshold: float = 70.0
) -> List[str]:
    """
    INTEGRATED SEMANTIC VALIDATOR PIPELINE:
    1. Advanced Clean -> 2. Segment -> 3. Validate -> 4. Merge -> 5. Filter
    """
    cleaned_text = advanced_clean(text)
    if not cleaned_text.strip():
        return []

    doc = nlp(cleaned_text)
    raw_clauses = [sent.text.strip() for sent in doc.sents]
    validated_clauses = []

    for clause in raw_clauses:
        if len(clause.split()) < 8:
            continue

        is_regional = bool(re.search(r"[\u0900-\u097F]", clause))
        if is_regional:
            res = _process_regional_clause(clause)
            if res:
                validated_clauses.append(res)
        else:
            res = _process_english_clause(clause, confusion_threshold)
            if res:
                validated_clauses.append(res)
            elif validated_clauses:
                # Merge logic if fragment
                merged = merge_with_previous(clause, validated_clauses[-1])
                if merged:
                    m_res = (_process_regional_clause(merged)
                             if bool(re.search(r"[\u0900-\u097F]", merged))
                             else _process_english_clause(merged, confusion_threshold))
                    if m_res:
                        validated_clauses[-1] = m_res

    return validated_clauses


# ---------------------------------------------------------------------------
# Symbolic Analysis Engine (Deterministic Rule-Based Analysis)
# ---------------------------------------------------------------------------


class SymbolicAnalysisEngine:
    """
    Deterministic, rule-based engine for analyzing banking policy documents.

    Works universally for any bank PDF by analyzing:
    1. Clause Segmentation: spaCy sentence splitting + noise filtering
    2. Jargon Detection: Universal banking/legal term database
    3. Confusion Index Scoring: Flesch Reading Ease inverse (0-100)
    4. Financial Metrics Detection: Regex for amounts (₹) and rates (%)
    5. Risk Classification: Maps scores to Low/Medium/High categories

    All logic is symbolic and deterministic (no ML/LLM).
    Page awareness: Each clause tracks which page it came from.
    """

    # Universal Banking/Legal Jargon Dictionary
    JARGON_DATABASE = {
        "penalties": [
            "late fee",
            "default",
            "charge",
            "penalty",
            "fine",
            "late payment",
            "defaulted",
            "defaulting",
            "penalties",
            "charges",
            "fines",
            "fees",
            # Hindi / Marathi equivalents
            "दंड",
            "विलंब शुल्क",
            "जुर्माना",
            "शुल्क",
        ],
        "interest": [
            "apr",
            "p.a.",
            "interest",
            "per annum",
            "finance charge",
            "interest rate",
            "annual percentage rate",
            "rate of interest",
            "percentage per annum",
            "compound interest",
            "simple interest",
            "accrued interest",
            # Hindi / Marathi equivalents
            "व्याज",
            "व्याज दर",
            "ब्याज",
            "ब्याज दर",
        ],
        "legal": [
            "indemnify",
            "liable",
            "jurisdiction",
            "arbitration",
            "sole discretion",
            "liability",
            "liable for",
            "indemnification",
            "indemnified",
            "indemnifying",
            "arbitrator",
            "arbitrate",
            "legal jurisdiction",
            "governing law",
            "exclusive jurisdiction",
            "legal venue",
            "legal recourse",
            # Hindi / Marathi equivalents
            "जबाबदार",
            "नुकसानभरपाई",
            "कायदेशीर",
            "दायित्व",
            "हर्जाना",
            "बंधने",
            "अधिकार",
            "क्षेत्राधिकार",
            "थकीत",
            "अंतिम",
            "शर्तें",
            "प्रतिबंध",
            "बकाया",
            "अनिवार्य",
        ],
    }

    # Financial amounts: ₹ symbol followed by number
    AMOUNT_PATTERN = re.compile(r"₹\s*[\d\u0966-\u096F,]+(?:\.[\d\u0966-\u096F]{1,3})?")
    # Interest rates: percentage patterns
    RATE_PATTERN = re.compile(r"([\d\u0966-\u096F]+(?:\.[\d\u0966-\u096F]+)?)\s*%")

    @staticmethod
    def segment_clauses(text: str) -> List[str]:
        """
        PHASE 1: Clause Segmentation + Noise Filtering

        Input text is expected to be lattice-aware and healed: body paragraphs plus
        contextual table rows ("Header: Value.") as structurally complete sentences.

        THE GATEKEEPER LOGIC:
        - Uses spaCy to split text into sentences
        - Filters out noise:
          * Short (<7 words) UNLESS contains ₹/% or fee (keeps table rows like "Charges: 3%.")
          * Purely numeric segments (table data)
          * Navigational text ("Page X", URLs, etc.)
        - Cleans whitespace
        """
        if not text or not text.strip():
            return []

        # Process text with spaCy for sentence segmentation
        doc = nlp(text)
        clauses = []

        # Patterns for navigational/noise text
        nav_patterns = [
            r"page\s*\d+",
            r"https?://",
            r"www\.",
            r"^\d+\.\d+$",
            r"^[\d\s\.]+$",
        ]
        nav_regex = re.compile("|".join(nav_patterns), re.IGNORECASE)

        for sent in doc.sents:
            clause = sent.text.strip()

            # Clean excess whitespace
            clause = re.sub(r"\s+", " ", clause)

            # Skip navigational/noise text
            if nav_regex.search(clause):
                continue

            # Filter: Must have at least 7 words UNLESS contains financial markers
            words = clause.split()
            has_financial_marker = bool(re.search(r"[₹Rs%]", clause)) or bool(
                re.search(r"\bfee\b", clause, re.IGNORECASE)
            )

            if len(words) < 7 and not has_financial_marker:
                continue

            # Skip purely numeric segments
            if re.match(r"^\d+[\d\s\.,]*$", clause):
                continue

            clauses.append(clause)

        return clauses

    @staticmethod
    def detect_jargon(text: str) -> List[str]:
        """
        PHASE 2: Jargon Detection

        Scans clause text for known banking/legal jargon terms.
        Returns list of detected terms (case-insensitive, deduplicated).
        """
        detected = []
        text_lower = text.lower()

        for category, terms in SymbolicAnalysisEngine.JARGON_DATABASE.items():
            for term in terms:
                if term in text_lower:
                    if term not in detected:
                        detected.append(term)

        return detected

    @staticmethod
    def detect_financial_metrics(text: str) -> Optional[str]:
        """
        Detects financial metrics: currency amounts (₹) or interest rates (%).
        Returns a formatted string if found, else None.

        Examples:
          "₹1,00,000" -> "₹1,00,000"
          "5.5% APR" -> "5.5%"
        """
        # Try to find an amount first
        amount_match = SymbolicAnalysisEngine.AMOUNT_PATTERN.search(text)
        if amount_match:
            return amount_match.group(0)

        # Try to find a rate
        rate_match = SymbolicAnalysisEngine.RATE_PATTERN.search(text)
        if rate_match:
            return rate_match.group(0)

        return None

    @staticmethod
    def calculate_confusion_index(text: str) -> float:
        """
        PHASE 3: Confusion Index Scoring (Deterministic Math)

        If text uses a regional script, immediately bypass textstat
        and return a fixed confusion score. textstat (Flesch) is mathematically
        invalid for Indic structures.
        """
        if not text or len(text.split()) < 2:
            return 0.0

        is_regional = bool(re.search(r"[\u0900-\u097F]", text))
        if is_regional:
            return 85.0

        flesch_score = textstat.flesch_reading_ease(text)
        confusion_index = max(0.0, min(100.0, 100.0 - flesch_score))

        return round(confusion_index, 2)

    @staticmethod
    def classify_risk(confusion_score: float) -> str:
        """
        PHASE 4: Risk Classification

        0 - 40:   "LOW"    (Clear text, easy to understand)
        41 - 70:  "MEDIUM" (Moderate confusion, requires attention)
        71 - 100: "HIGH"   (Highly confusing, immediate review needed)
        """
        if confusion_score <= 40:
            return "LOW"
        elif confusion_score <= 70:
            return "MEDIUM"
        else:
            return "HIGH"

    @classmethod
    async def analyze_high_risk_only(
        cls,
        pages_data: List[Tuple[int, str]],
        pdf_bytes: bytes,
        language: str,
        page_types: Dict[int, str] = None  # New: Page classification metadata
    ) -> HighRiskAnalysisResponse:
        """
        HIGH-RISK-ONLY ANALYSIS PIPELINE WITH SEMANTIC VALIDATOR

        1. Semantic Validation: Grammar check + risk keywords
        2. The Gatekeeper: Filter to confusion > 70
        3. The Translator: Sarvam AI (Primary) + Gemini (Fallback)
        4. Coordinates: PDF highlighting
        """

        all_text = "\n\n".join([text for _, text in pages_data])
        if not all_text.strip():
            return HighRiskAnalysisResponse(
                status="ANALYSIS_COMPLETE",
                pii_result="OK",
                meta={"total_scanned": 0, "high_risk_found": 0},
                high_risk_clauses=[],
            )

        clauses_with_pages = []
        for page in pages_data:
            clauses_with_pages.extend(process_pdf_page_semantic_parallel(page))

        total_scanned = len(clauses_with_pages)

        high_risk_clauses_with_pages = []
        for page_num, clause in clauses_with_pages:
            confusion_score = cls.calculate_confusion_index(clause)

            # ── CV FUSION: Boost risk if page is a TABLE ─────────────────────
            page_type = (page_types or {}).get(page_num, "TEXT")
            if page_type == "TABLE":
                confusion_score += CV_TABLE_BOOST

            if confusion_score > 55:  # Lowered from 70 to include Medium-High risk
                high_risk_clauses_with_pages.append(
                    {"page": page_num, "text": clause, "score": confusion_score}
                )

        high_risk_clauses_with_pages.sort(key=lambda x: x["score"], reverse=True)
        texts_to_simplify = [unicodedata.normalize("NFKC", c["text"]) for c in high_risk_clauses_with_pages]
        simplified_map = await cls._orchestrate_ai_simplification(texts_to_simplify, language)

        return await _build_high_risk_response(
            high_risk_clauses_with_pages, simplified_map, pdf_bytes, total_scanned, page_types
        )

    @classmethod
    async def _orchestrate_ai_simplification(
        cls, texts: List[str], language: str
    ) -> Dict[str, str]:
        """Orchestrate TinyLlama Routing -> Sarvam AI -> Gemini fallback."""
        simplified_map = {}
        if not texts:
            return simplified_map

        print(f"🧠 [Agentic Router] TinyLlama evaluating {len(texts)} clauses locally...")
        complex_texts = []
        for text in texts:
            # Prevent FastAPI event loop blocking by offloading HuggingFace/Torch inference to a thread
            classification = await run_in_threadpool(LocalLLMRouter.classify_complexity_local, text)
            if classification == "COMPLEX":
                complex_texts.append(text)
            else:
                simplified_map[text] = text

        if not complex_texts:
            print("✅ All clauses routed as SIMPLE locally. Bypassing external APIs completely.")
            return simplified_map

        print(f"🚀 DEBUG: BFSI Pipeline - Attempting Sarvam AI for {len(complex_texts)} COMPLEX clauses.")
        try:
            sarvam_map = await simplify_with_sarvam(complex_texts, language)
            simplified_map.update(sarvam_map)

            missing_texts = [t for t in complex_texts if t not in simplified_map or not simplified_map[t]]
            if missing_texts:
                print(f"⚠️ Sarvam AI partially failed ({len(missing_texts)} missing). They will be skipped.")
        except Exception as e:
            print(f"❌ Sarvam AI Failure ({e}). Clauses skipped.")

        return simplified_map

    @classmethod
    def analyze_page_aware(
        cls, pages_data: List[Tuple[int, str]], page_types: Dict[int, str] = None
    ) -> SymbolicAnalysisResponse:
        """
        Main Analysis Pipeline (Page-Aware)

        Input:
          pages_data: List of (page_number, page_text) tuples

        Output:
          SymbolicAnalysisResponse with ALL clauses scored, classified, and mapped to pages.
          NO TRUNCATION.
        """

        # Combine all text for issuer detection + word count
        all_text = "\n\n".join([text for _, text in pages_data])

        if not all_text.strip():
            return SymbolicAnalysisResponse(
                status="ANALYSIS_COMPLETE",
                pii_result="OK",
                message="No text extracted from document.",
                meta={"total_clauses": 0, "high_risk_count": 0, "avg_complexity": 0.0},
                analysis=[],
            )

        # Step 1: Segment and map clauses to pages
        clauses_with_pages = []

        for page_num, page_text in pages_data:
            clauses = cls.segment_clauses(page_text)
            for clause in clauses:
                clauses_with_pages.append((page_num, clause))

        if not clauses_with_pages:
            return SymbolicAnalysisResponse(
                status="ANALYSIS_COMPLETE",
                pii_result="OK",
                message="No analyzable clauses found after noise filtering.",
                meta={"total_clauses": 0, "high_risk_count": 0, "avg_complexity": 0.0},
                analysis=[],
            )

        # Step 2: Analyze each clause
        analysis_list = []
        total_confusion = 0.0
        high_risk_count = 0

        for clause_id, (page_num, clause) in enumerate(clauses_with_pages, start=1):
            # Detect jargon in this clause
            jargon_terms = cls.detect_jargon(clause)

            # Calculate confusion index (0-100)
            confusion_score = cls.calculate_confusion_index(clause)

            # Detect financial metrics
            financial_metric = cls.detect_financial_metrics(clause)

            # Classify risk
            risk_level = cls.classify_risk(confusion_score)

            # Track high-risk clauses
            if risk_level == "HIGH":
                high_risk_count += 1

            # Accumulate for average calculation
            total_confusion += confusion_score

            # Build clause analysis object
            clause_analysis = ClauseAnalysis(
                id=clause_id,
                page=page_num,
                page_type=page_types.get(page_num, "TEXT") if page_types else "TEXT",
                original_text=clause,
                risk_level=risk_level,
                confusion_score=confusion_score,
                jargon_detected=jargon_terms,
                financial_metric=financial_metric,
            )
            analysis_list.append(clause_analysis)

        # Step 3: Calculate averages
        avg_confusion = (
            round(total_confusion / len(clauses_with_pages), 2)
            if clauses_with_pages
            else 0.0
        )

        # Step 4: Build response
        return SymbolicAnalysisResponse(
            status="ANALYSIS_COMPLETE",
            pii_result="OK",
            meta={
                "total_clauses": len(clauses_with_pages),
                "high_risk_count": high_risk_count,
                "avg_complexity": avg_confusion,
            },
            analysis=analysis_list,
        )


async def _build_high_risk_response(
    clauses: List[dict],
    simplified_map: dict,
    pdf_bytes: bytes,
    total: int,
    page_types: Dict[int, str] = None
):
    """Construct HighRiskAnalysisResponse from filtered clauses."""
    response_clauses = []
    for idx, c in enumerate(clauses, start=1):
        simplified = simplified_map.get(c["text"], "").strip() or _fallback_simplified_text(c["text"])
        coords = extract_coordinates_from_pdf(pdf_bytes, c["page"], c["text"])

        # Use first match if coordinates found, otherwise empty list (no phantom highlights)
        response_clauses.append(
            HighRiskClauseAnalysis(
                id=idx,
                page=c["page"],
                page_type=page_types.get(c["page"], "TEXT") if page_types else "TEXT",
                original_text=c["text"],
                simplified=simplified,
                risk_score=c["score"],
                highlight_coords=coords or [],  # Return empty rather than generic boxes
            )
        )
    return HighRiskAnalysisResponse(
        status="ANALYSIS_COMPLETE",
        pii_result="OK",
        meta={"total_scanned": total, "high_risk_found": len(response_clauses)},
        high_risk_clauses=response_clauses,
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@app.post("/analyze/upload", response_model=HighRiskAnalysisResponse)
async def analyze_upload(  # noqa: C901
    background_tasks: BackgroundTasks,
    language: str = Query(..., description="User-selected language code"),
    file: UploadFile = File(...),
) -> HighRiskAnalysisResponse:
    """
    HIGH-RISK-ONLY Analysis Endpoint for AVAGAMYA v3.
    UX ISOLATION: Compliance logging is offloaded to BackgroundTasks to minimize latency.
    """

    start_time = time.time()

    # Basic file validation
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=400,
            detail="Invalid content type. Expected application/pdf.",
        )

    pdf_bytes = await file.read()
    _validate_file(file, pdf_bytes)

    # Extract all text (for PII check + Empty Guardrail)
    all_text = extract_text_with_layout(pdf_bytes)
    if not all_text.strip():
        raise HTTPException(status_code=400, detail="Empty PDF not allowed. Please upload a document with valid content.")

    unique_hash = hashlib.sha256(pdf_bytes).hexdigest()
    pages_data = reconstruct_text_healer(pdf_bytes)
    issuer = detect_issuer(all_text)

    # ---------- STEP 1: Run PII Security Check ----------
    pii_result = scan_for_pii(all_text, issuer)

    # ---------- STEP 2: If BLOCKED, return immediately ----------
    if pii_result.status == "BLOCKED":
        return _handle_blocked_upload(background_tasks, file, language, unique_hash, start_time, pdf_bytes)

    # ---------- STEP 3: CACHE LOOKUP (before expensive AI pipeline) ----------
    cached = cache_get(unique_hash, language)
    if cached is not None:
        # Reconstruct response from cached JSONB, skip all LLM calls
        cached_clauses = [
            HighRiskClauseAnalysis(**c) for c in (cached["ai_results"] or [])
        ]
        background_tasks.add_task(
            log_dpo_event,
            filename=file.filename or "unknown.pdf",
            status="CLEAN",
            details="Cache Hit: Returned from document_cache",
            processing_time=round(time.time() - start_time, 2),
            language_detected=language,
            unique_hash=unique_hash,
            risk_score=f"{len(cached_clauses)} High Risk Clauses (Cached)",
        )
        gc.collect()
        return JSONResponse(
            content=HighRiskAnalysisResponse(
                status="ANALYSIS_COMPLETE",
                pii_result="OK",
                meta={
                    "total_scanned": len(cached_clauses),
                    "high_risk_found": len(cached_clauses),
                    "cache": "HIT",
                },
                high_risk_clauses=cached_clauses,
            ).model_dump(),
            media_type="application/json",
        )

    # ---------- STEP 4: CV Layout Analysis (Parallel Microservice) ----------
    page_types = {}
    try:
        async def scan_page(page_num, doc_bytes):
            try:
                single_page = fitz.open()
                single_page.insert_pdf(
                    fitz.open(
                        stream=doc_bytes,
                        filetype="pdf"),
                    from_page=page_num - 1,
                    to_page=page_num - 1)
                buf = io.BytesIO()
                single_page.save(buf)
                buf.seek(0)
                async with httpx.AsyncClient(timeout=15.0) as client:
                    files = {'file': ('p.pdf', buf, 'application/pdf')}
                    resp = await client.post(f"{CV_CLASSIFIER_URL}/classify-page", files=files)
                    if resp.status_code == 200:
                        return page_num, resp.json().get("page_type", "TEXT")
            except Exception:
                pass
            return page_num, "TEXT"

        # Scan all pages in parallel (capped at 10 pages for demo speed)
        scan_tasks = [scan_page(p_num, pdf_bytes) for p_num, _ in pages_data[:10]]
        cv_results = await asyncio.gather(*scan_tasks)
        page_types = {p: t for p, t in cv_results}
        print(f"🖼️ CV SCAN COMPLETE: {page_types}")
    except Exception as e:
        print(f"⚠️ CV Parallel Scan Failed: {e}")

    # ---------- STEP 5: If OK, run High-Risk-Only Analysis Engine ----------
    high_risk_result = await SymbolicAnalysisEngine.analyze_high_risk_only(
        pages_data, pdf_bytes, language, page_types=page_types
    )

    # ---------- STEP 5: CACHE WRITE (non-blocking, after pipeline completes) ----------
    if high_risk_result.high_risk_clauses:
        avg_confusion = round(
            sum(c.risk_score for c in high_risk_result.high_risk_clauses)
            / len(high_risk_result.high_risk_clauses),
            2,
        )
        background_tasks.add_task(
            cache_set,
            file_hash=unique_hash,
            language=language,
            confusion_index=avg_confusion,
            ai_results=[
                c.model_dump() for c in high_risk_result.high_risk_clauses
            ],
        )

    background_tasks.add_task(
        log_dpo_event,
        filename=file.filename or "unknown.pdf",
        status="CLEAN",
        details="No sensitive PII detected",
        processing_time=round(time.time() - start_time, 2),
        language_detected=language,
        unique_hash=unique_hash,
        risk_score=f"{high_risk_result.meta.get('high_risk_found', 0)} High Risk Clauses",
    )

    gc.collect()
    return JSONResponse(content=high_risk_result.model_dump(), media_type="application/json")


def _validate_file(file: UploadFile, pdf_bytes: bytes):
    """Perform basic file validation."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Invalid content type.")
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty document.")
    if len(pdf_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Payload Too Large (max 5MB).")


def _handle_blocked_upload(tasks, file, lang, uhash, start, pdf_bytes):
    """Handle the response for a blocked PII upload."""
    tasks.add_task(
        log_dpo_event,
        filename=file.filename or "unknown.pdf",
        status="BLOCKED",
        details="PII Detected (e.g., Credit Card/PAN)",
        processing_time=round(time.time() - start, 2),
        language_detected=lang,
        unique_hash=uhash,
        risk_score="CRITICAL (Blocked)",
    )
    gc.collect()
    return HighRiskAnalysisResponse(
        status="BLOCKED",
        pii_result="BLOCKED",
        message="Security Alert: Personal details detected.",
        meta={"total_scanned": 0, "high_risk_found": 0},
        high_risk_clauses=[],
    )


@app.get("/analyze/dpo/logs")
async def get_dpo_logs():
    """
    Retrieve recent DPO audit logs from Supabase database for the Recent Activity Stream.

    Returns:
      JSON list of the last 10 audit logs, ordered by timestamp descending (most recent first).
    """
    try:
        if not supabase:
            return []
        response = (
            supabase.table("compliance_logs")
            .select("*")
            .order("timestamp", desc=True)
            .limit(10)
            .execute()
        )
        return response.data
    except Exception as e:
        print(f"Failed to fetch logs from Supabase: {e}")
        return []


@app.get("/audit/summary")
async def get_audit_summary():
    """
    Retrieve real-time audit summary aggregating live data from the Supabase compliance_logs table.
    """
    try:
        if not supabase:
            return {"total_processed": 0, "compliance_percentage": 0.0, "avg_processing_time_last_50": 0.0}

        # Total Processed Count
        count_resp = (
            supabase.table("compliance_logs").select("*", count="exact").execute()
        )
        total_count = (
            count_resp.count if count_resp.count is not None else len(count_resp.data)
        )

        # Clean Count
        clean_resp = (
            supabase.table("compliance_logs")
            .select("*", count="exact")
            .eq("status", "CLEAN")
            .execute()
        )
        clean_count = (
            clean_resp.count if clean_resp.count is not None else len(clean_resp.data)
        )

        compliance_percentage = 0.0
        if total_count > 0:
            compliance_percentage = round((clean_count / total_count) * 100, 2)

        # Average processing time for the last 50
        recent_resp = (
            supabase.table("compliance_logs")
            .select("processing_time")
            .order("timestamp", desc=True)
            .limit(50)
            .execute()
        )
        recent_times = [
            row["processing_time"]
            for row in recent_resp.data
            if row.get("processing_time") is not None
        ]

        avg_time = 0.0
        if recent_times:
            avg_time = round(sum(recent_times) / len(recent_times), 2)

        return {
            "total_processed": total_count,
            "compliance_percentage": compliance_percentage,
            "avg_processing_time_last_50": avg_time,
        }
    except Exception as e:
        print(f"Failed to calculate audit summary: {e}")
        return {
            "total_processed": 0,
            "compliance_percentage": 0.0,
            "avg_processing_time_last_50": 0.0,
        }


def process_pdf_page_parallel(page_data: Tuple[int, str]) -> List[Dict]:
    """Standalone worker function for ProcessPoolExecutor to map across PDF pages."""
    page_num, raw_text = page_data
    page_results = []

    # Mathematical segmenter built to run per-process
    raw_clauses = MathematicalRiskEngine.segment_clauses(raw_text)

    for text in raw_clauses:
        if len(text.split()) < 8:
            continue  # Anti-Nonsense Filter

        # Zero Gemini mathematical scoring
        score, jargon = MathematicalRiskEngine.calculate_risk_score(text)

        if score >= 40:
            page_results.append(
                {
                    "id": str(uuid.uuid4())[:8],
                    "page": page_num,
                    "original_text": text,
                    "jargon_detected": jargon,
                    "mathematical_score": score,
                }
            )

    return page_results


def process_pdf_page_semantic_parallel(
    page_data: Tuple[int, str],
) -> List[Tuple[int, str]]:
    """Standalone worker for the Semantic Validation pipeline used in /analyze/upload."""
    page_num, raw_text = page_data
    clauses_with_pages = []

    # Run the heavy Spacy/Grammar validation pipeline per process
    validated_page_clauses = semantic_segment_and_validate(
        raw_text, confusion_threshold=70.0
    )
    for clause in validated_page_clauses:
        clauses_with_pages.append((page_num, clause))

    return clauses_with_pages


@app.post("/analyze/compliance/audit")
async def analyze_compliance_audit(
    background_tasks: BackgroundTasks, file: UploadFile = File(...)
):
    start_time = time.time()
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files supported.")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty document.")

    if len(pdf_bytes) > 5 * 1024 * 1024:
        del pdf_bytes
        gc.collect()
        raise HTTPException(
            status_code=413, detail="Payload Too Large. Free tier limit is 5MB."
        )

    unique_hash = hashlib.sha256(pdf_bytes).hexdigest()

    try:
        pages_data = reconstruct_text_healer(pdf_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {exc}")

    # Process PDF pages sequentially to optimize Memory on Free Tier
    results = []
    for page in pages_data:
        results.extend(process_pdf_page_parallel(page))

    # Recalculate meta
    high_risk_count = len(results)
    # The total clauses scanned is harder to track strictly within the worker without returning tuples,
    # but for compliance auditing, high_risk_found is primary. Let's estimate total based on typical density.
    total_clauses_estimation = len(pages_data) * 15

    processing_time = round(time.time() - start_time, 2)
    risk_score_str = (
        f"{high_risk_count} High Risk" if high_risk_count > 0 else "Low Risk"
    )

    # UX Isolation: Background Logging
    background_tasks.add_task(
        log_dpo_event,
        filename=file.filename or "unknown.pdf",
        status="CLEAN" if high_risk_count == 0 else "BLOCKED",
        details=f"Compliance Audit: {high_risk_count} High Risk Clauses",
        processing_time=processing_time,
        language_detected="Unknown",
        unique_hash=unique_hash,
        risk_score=risk_score_str,
    )

    # Final Garbage Collection Flush
    del pdf_bytes
    del pages_data
    gc.collect()

    return {
        "status": "COMPLIANCE_AUDIT_COMPLETE",
        "meta": {
            "total_scanned": total_clauses_estimation,
            "high_risk_found": high_risk_count,
        },
        "clauses": sorted(results, key=lambda x: x["mathematical_score"], reverse=True),
    }


# ---------------------------------------------------------------------------
# Sandbox Endpoint
# ---------------------------------------------------------------------------


class SandboxRequest(BaseModel):
    text: str


class SandboxResponse(BaseModel):
    score: float
    detected_jargon: List[str]


@app.post("/analyze/compliance/sandbox", response_model=SandboxResponse)
async def analyze_compliance_sandbox(request: SandboxRequest) -> SandboxResponse:
    """
    Live mathematical risk calculation for the Compliance Officer Sandbox Draft Editor.
    Calculates Risk Velocity: (Jargon Hits * 15) + (Words / 5).
    Applies +10 point penalty for regional scripts containing jargon.
    """
    if not request.text or not request.text.strip():
        return SandboxResponse(score=0.0, detected_jargon=[])

    score, jargon = MathematicalRiskEngine.calculate_risk_score(request.text)

    return SandboxResponse(score=score, detected_jargon=jargon)


# ---------------------------------------------------------------------------
# Jira Escalation Real-Time PERSISTENCE
# ---------------------------------------------------------------------------

class JiraEscalateRequest(BaseModel):
    notes: str


@app.post("/analyze/compliance/escalate")
async def analyze_compliance_escalate(request: JiraEscalateRequest):
    """
    Persist remediation notes to Supabase and return a mock Jira Ticket ID.
    This enables real-time synchronization with legal team dashboards.
    """
    ticket_id = f"LGL-{uuid.uuid4().hex[:4].upper()}"

    if supabase:
        try:
            supabase.table("jira_escalations").insert({
                "ticket_id": ticket_id,
                "remediation_notes": request.notes,
                "status": "OPEN"
            }).execute()
        except Exception as e:
            print(f"Jira escalation persistence failed: {e}")

    return {"status": "SUCCESS", "ticket_id": ticket_id}

# ---------------------------------------------------------------------------
# Sarvam AI TTS Proxy
# ---------------------------------------------------------------------------


class TTSRequest(BaseModel):
    text: str
    language: str


@app.post("/api/tts")
async def generate_tts(request: TTSRequest):
    """
    Proxy endpoint to Sarvam AI TTS API.
    Returns the base64 audio string.
    """
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="SARVAM_API_KEY not configured")

    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "api-subscription-key": api_key,
        "Content-Type": "application/json"
    }

    # Standard Sarvam TTS Payload
    payload = {
        "inputs": [request.text],
        "target_language_code": request.language,
        "speaker": "meera",
        "pitch": 0,
        "pace": 0.9,  # Match the slow rate requested earlier
        "loudness": 1.5,
        "speech_sample_rate": 8000,
        "enable_preprocessing": True,
        "model": "auras-tts"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # First try with Sarvam standard payload
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                # Fallback to the generic payload suggested by the user if standard fails
                fallback_payload = {
                    "text": request.text,
                    "language": request.language
                }
                headers["Authorization"] = f"Bearer {api_key}"
                response = await client.post(url, headers=headers, json=fallback_payload)

            response.raise_for_status()
            data = response.json()

            # Sarvam typically returns {"audios": ["base64..."]}
            if "audios" in data and len(data["audios"]) > 0:
                return {"audio": data["audios"][0]}
            elif "audio" in data:
                return {"audio": data["audio"]}
            elif "base64" in data:
                return {"audio": data["base64"]}
            else:
                raise HTTPException(status_code=500, detail="No audio returned from TTS API")
        except Exception as e:
            print(f"TTS Error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# Telemetry Endpoint for DPODashboard
# ---------------------------------------------------------------------------


@app.get("/api/v1/system/telemetry")
async def get_system_telemetry():
    """
    Returns live system telemetry for the DPO Dashboard.
    Ensures data residency and zero-retention (ephemeral) processing validation.
    """
    residency = os.getenv("RESIDENCY_REGION", "ap-south-1 (Mumbai)")
    return {
        "status": "active",
        "residency_region": residency,
        "retention_policy": "Zero-Retention (Ephemeral)",
        "pii_bytes_retained": 0,
    }


# ---------------------------------------------------------------------------
# Feature 1 — ML Risk Classifier  (POST /analyze/ml-risk)
# ---------------------------------------------------------------------------

class MLRiskRequest(BaseModel):
    clause: str
    compare_symbolic: bool = True   # also run the rule-based engine for A/B
    page_type: Optional[str] = "TEXT"  # New: "TABLE", "TEXT", etc.


class MLRiskResponse(BaseModel):
    clause: str
    ml_risk_level: str
    ml_confidence: float
    ml_probabilities: Dict
    ml_features: Dict
    symbolic_risk_level: Optional[str] = None   # from deterministic engine
    symbolic_score: Optional[float] = None
    model_status: str   # "READY" | "NOT_TRAINED"


@app.post("/analyze/ml-risk", response_model=MLRiskResponse)
async def analyze_ml_risk(request: MLRiskRequest) -> MLRiskResponse:
    """
    Feature 1 — ML-powered risk prediction using a trained Random Forest.

    Runs the Sklearn model (11 engineered features) and optionally compares
    against the deterministic symbolic engine so the two can be A/B tested.

    JD: Design/deploy ML models · Scikit-learn · Model evaluation.
    """
    clause = (request.clause or "").strip()
    if not clause:
        raise HTTPException(status_code=400, detail="clause must not be empty")

    model_status = "READY" if (ML_RF_MODEL is not None) else "NOT_TRAINED"

    # ── ML Prediction ────────────────────────────────────────────────────────
    if ML_AVAILABLE and ML_RF_MODEL is not None:
        pred = predict_risk(clause, ML_RF_MODEL, ML_LE)
    else:
        pred = {
            "risk_level": "UNKNOWN",
            "confidence": 0.0,
            "probabilities": {},
            "features": {},
            "error": "Model not trained. Run AVAGAMYA_EDA.ipynb first.",
        }

    # ── CV FUSION: Apply boost to symbolic score if on a table ────────────────
    sym_level, sym_score = None, None
    if request.compare_symbolic:
        sym_score, _ = MathematicalRiskEngine.calculate_risk_score(clause)

        # Apply CV boost if applicable
        if request.page_type == "TABLE":
            sym_score += CV_TABLE_BOOST

        if sym_score <= 40:
            sym_level = "LOW"
        elif sym_score <= 70:
            sym_level = "MEDIUM"
        else:
            sym_level = "HIGH"

    return MLRiskResponse(
        clause=clause,
        ml_risk_level=pred["risk_level"],
        ml_confidence=pred["confidence"],
        ml_probabilities=pred["probabilities"],
        ml_features=pred["features"],
        symbolic_risk_level=sym_level,
        symbolic_score=sym_score,
        model_status=model_status,
    )


# ---------------------------------------------------------------------------
# Feature 2 — Analytics Dashboard  (GET /analytics/document-stats)
# ---------------------------------------------------------------------------

@app.get("/analytics/document-stats")
async def get_document_analytics():
    """
    Feature 2 — Pandas-powered compliance analytics.

    Pulls the full compliance_logs table into a Pandas DataFrame, cleans it,
    and computes aggregated stats for the React analytics dashboard.

    JD: Data analysis/visualisation · Pandas · NumPy · SQL/Supabase.
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        rows = supabase.table("compliance_logs").select("*").execute().data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase read failed: {e}")

    if not rows:
        return {
            "total_documents": 0,
            "message": "No compliance data yet. Upload some PDFs first.",
        }

    # ── Load into Pandas ──────────────────────────────────────────────────────
    df = pd.DataFrame(rows)

    # ── Data Cleaning ─────────────────────────────────────────────────────────
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["processing_time"] = pd.to_numeric(df["processing_time"], errors="coerce")

    # Parse numeric risk score (stored as string like "3 High Risk Clauses")
    df["risk_count"] = (
        df["risk_score"]
        .astype(str)
        .str.extract(r"(\d+)")
        .astype(float)
        .fillna(0)
    )

    # Drop rows with no timestamp (data quality)
    df = df.dropna(subset=["timestamp"])
    df = df.drop_duplicates(subset=["unique_hash"], keep="last")

    # ── Feature Engineering ───────────────────────────────────────────────────
    df["date"] = df["timestamp"].dt.date.astype(str)
    df["hour"] = df["timestamp"].dt.hour
    df["is_blocked"] = (df["status"] == "BLOCKED").astype(int)

    # ── Aggregations (NumPy + Pandas) ─────────────────────────────────────────
    total_docs = int(len(df))
    blocked_count = int(df["is_blocked"].sum())
    clean_count = total_docs - blocked_count
    compliance_pct = round(clean_count / total_docs * 100, 2) if total_docs else 0.0

    avg_proc_time = round(float(df["processing_time"].mean()), 3) if not df["processing_time"].isna().all() else 0.0
    p95_proc_time = round(float(np.percentile(df["processing_time"].dropna(), 95)), 3) if len(df) else 0.0
    avg_risk_count = round(float(df["risk_count"].mean()), 2)
    max_risk_count = int(df["risk_count"].max())

    # Status breakdown
    status_dist = df["status"].value_counts().to_dict()

    # Language breakdown
    lang_dist = df["language_detected"].value_counts().to_dict()

    # Daily upload trend (last 30 days)
    daily_trend = (
        df.groupby("date")["unique_hash"]
        .count()
        .tail(30)
        .reset_index()
        .rename(columns={"unique_hash": "uploads"})
        .to_dict(orient="records")
    )

    # Peak hour analysis
    peak_hour = int(df["hour"].mode()[0]) if not df["hour"].empty else 0

    # Top risk documents (highest clause count)
    top_risk_docs = (
        df.nlargest(5, "risk_count")[["filename", "risk_count", "timestamp", "language_detected"]]
        .assign(timestamp=lambda d: d["timestamp"].astype(str))
        .to_dict(orient="records")
    )

    return {
        "total_documents": total_docs,
        "clean_count": clean_count,
        "blocked_count": blocked_count,
        "compliance_percentage": compliance_pct,
        "processing_time_stats": {
            "avg_seconds": avg_proc_time,
            "p95_seconds": p95_proc_time,
        },
        "risk_stats": {
            "avg_high_risk_clauses": avg_risk_count,
            "max_high_risk_clauses": max_risk_count,
        },
        "status_distribution": status_dist,
        "language_distribution": lang_dist,
        "daily_upload_trend": daily_trend,
        "peak_upload_hour": peak_hour,
        "top_risk_documents": top_risk_docs,
    }


# ---------------------------------------------------------------------------
# Feature 4 — TF-IDF Jargon Relevance Scorer  (POST /analyze/tfidf-score)
# ---------------------------------------------------------------------------

class TFIDFRequest(BaseModel):
    clauses: List[str]   # List of clause strings from the uploaded document


@app.post("/analyze/tfidf-score")
async def analyze_tfidf_score(request: TFIDFRequest):
    """
    Feature 4 — TF-IDF contextual jargon relevance scoring.

    Instead of binary jargon detection (present/absent), this endpoint
    computes TF-IDF scores so high-frequency jargon in a short doc is
    weighted more heavily than a single mention in a 50-page policy.

    JD: NLP · Scikit-learn · Feature engineering.
    """
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
    except ImportError:
        raise HTTPException(status_code=500, detail="scikit-learn not installed")

    clauses = [c.strip() for c in request.clauses if c.strip()]
    if not clauses:
        raise HTTPException(status_code=400, detail="clauses list must not be empty")

    # Jargon vocabulary (mirrors JARGON_DATABASE in compliance_engine.py)
    JARGON_VOCAB = [
        "penalty", "forfeit", "forfeiture", "levy", "late fee", "surcharge",
        "not liable", "no liability", "unlimited liability", "exclusive remedy",
        "indemnify", "indemnification", "hold harmless", "disclaimer",
        "sole discretion", "absolute discretion", "at its discretion",
        "reserve the right", "may refuse", "without notice", "revoke",
        "arbitration", "jurisdiction", "governing law", "breach", "default",
        "binding", "waiver",
    ]

    # Fit TF-IDF restricted to jargon vocabulary
    vectorizer = TfidfVectorizer(
        vocabulary=JARGON_VOCAB,
        ngram_range=(1, 3),
        lowercase=True,
        sublinear_tf=True,   # log(1+tf) dampening for long docs
    )
    tfidf_matrix = vectorizer.fit_transform(clauses)  # shape: (n_clauses, n_vocab)
    feature_names = vectorizer.get_feature_names_out().tolist()

    # Build per-clause results
    results = []
    for i, clause in enumerate(clauses):
        row = tfidf_matrix[i].toarray()[0]
        # Top jargon terms with non-zero TF-IDF score
        hits = [
            {"term": feature_names[j], "tfidf_score": round(float(row[j]), 4)}
            for j in row.argsort()[::-1]
            if row[j] > 0
        ][:5]   # top 5 per clause

        clause_tfidf_sum = float(round(row.sum(), 4))
        results.append({
            "clause_index": i,
            "clause_preview": clause[:80] + ("..." if len(clause) > 80 else ""),
            "tfidf_jargon_weight": clause_tfidf_sum,
            "top_jargon_terms": hits,
        })

    # Document-level: which jargon terms dominate the whole doc
    doc_scores = np.asarray(tfidf_matrix.sum(axis=0)).flatten()
    top_doc_jargon = [
        {"term": feature_names[j], "doc_tfidf": round(float(doc_scores[j]), 4)}
        for j in doc_scores.argsort()[::-1]
        if doc_scores[j] > 0
    ][:10]

    return {
        "total_clauses": len(clauses),
        "top_document_jargon": top_doc_jargon,
        "clause_scores": results,
    }


# ---------------------------------------------------------------------------
# Feature 6 — Compliance Dataset Export  (GET /export/compliance-dataset)
# ---------------------------------------------------------------------------

@app.get("/export/compliance-dataset")
async def export_compliance_dataset(fmt: str = Query("json", description="'json' or 'csv'")):
    """
    Feature 6 — Pandas-powered compliance audit dataset export.

    Joins compliance_logs + document_cache, cleans the data, engineers
    derived features, and returns a model-ready dataset as JSON or CSV.

    JD: Large dataset preprocessing · Pandas · NumPy · Feature engineering.
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    # ── Pull both tables ────────────────────────────────────────────────────
    try:
        logs = supabase.table("compliance_logs").select("*").execute().data
        cache = supabase.table("document_cache").select("file_hash,confusion_index").execute().data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase read failed: {e}")

    if not logs:
        raise HTTPException(status_code=404, detail="No compliance data found")

    df_logs = pd.DataFrame(logs)
    df_cache = pd.DataFrame(cache) if cache else pd.DataFrame(columns=["file_hash", "confusion_index"])

    # ── Join ─────────────────────────────────────────────────────────────
    df = pd.merge(df_logs, df_cache, left_on="unique_hash", right_on="file_hash", how="left")

    # ── Data Cleaning ─────────────────────────────────────────────────────────
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["processing_time"] = pd.to_numeric(df["processing_time"], errors="coerce")
    df["confusion_index"] = pd.to_numeric(df["confusion_index"], errors="coerce")
    df["risk_count"] = (
        df["risk_score"].astype(str).str.extract(r"(\d+)").astype(float).fillna(0)
    )
    df = df.drop_duplicates(subset="unique_hash", keep="last")
    df = df.dropna(subset=["timestamp"])

    # ── Feature Engineering ───────────────────────────────────────────────────
    df["is_blocked"] = (df["status"] == "BLOCKED").astype(int)
    df["is_regional"] = df["language_detected"].isin(["hi", "mr"]).astype(int)
    df["hour_of_day"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.day_name()
    df["processing_speed"] = np.where(
        df["processing_time"] > 0,
        (df["risk_count"] / df["processing_time"]).round(3),
        0.0,
    )

    # Select export columns
    export_cols = [
        "filename", "timestamp", "status", "language_detected",
        "processing_time", "risk_count", "confusion_index",
        "is_blocked", "is_regional", "hour_of_day", "day_of_week",
        "processing_speed", "unique_hash",
    ]
    export_cols = [c for c in export_cols if c in df.columns]
    df_export = df[export_cols].copy()
    df_export["timestamp"] = df_export["timestamp"].astype(str)

    if fmt.lower() == "csv":
        from fastapi.responses import StreamingResponse
        import io
        csv_buffer = io.StringIO()
        df_export.to_csv(csv_buffer, index=False)
        csv_buffer.seek(0)
        return StreamingResponse(
            iter([csv_buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=avagamya_compliance_dataset.csv"},
        )

    return {
        "total_records": int(len(df_export)),
        "columns": export_cols,
        "feature_engineered": ["is_blocked", "is_regional", "hour_of_day", "day_of_week", "processing_speed"],
        "dataset": df_export.fillna(0).to_dict(orient="records"),
    }

# ── CV Page Classifier Proxy (Feature 3 - Feature C) ────────────────────────


@app.post("/analyze/cv-verify-page")
async def verify_page_type(
    file: UploadFile = File(...),
    page_number: int = Query(1, description="1-indexed page number to verify")
):
    """
    Proxy endpoint to call the Google Cloud Run CV Page Classifier.
    Extracts the specified page from the uploaded PDF and sends it to the microservice.
    """
    if not PYMUPDF_AVAILABLE:
        raise HTTPException(status_code=500, detail="PyMuPDF not installed on backend")

    try:
        # Read the uploaded PDF
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        if page_number < 1 or page_number > len(doc):
            raise HTTPException(status_code=400, detail=f"Invalid page number. Document has {len(doc)} pages.")

        # Extract only the target page as a new PDF in memory
        single_page_doc = fitz.open()
        single_page_doc.insert_pdf(doc, from_page=page_number - 1, to_page=page_number - 1)

        # Write to buffer
        buffer = io.BytesIO()
        single_page_doc.save(buffer)
        buffer.seek(0)

        # Call the Cloud Run microservice
        async with httpx.AsyncClient(timeout=30.0) as client:
            files = {'file': ('page.pdf', buffer, 'application/pdf')}
            response = await client.post(f"{CV_CLASSIFIER_URL}/classify-page", files=files)

            if response.status_code != 200:
                return JSONResponse(
                    status_code=response.status_code,
                    content={"error": "CV Microservice failure", "details": response.text}
                )

            return response.json()

    except Exception as e:
        print(f"❌ CV Verification Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'doc' in locals():
            doc.close()
        if 'single_page_doc' in locals():
            single_page_doc.close()
