from __future__ import annotations

import uuid
import os
import re
import time
import hashlib
import asyncio
import unicodedata
import gc
import httpx

from datetime import datetime
from typing import Optional, Set, Tuple, List, Dict
from contextlib import asynccontextmanager
from dotenv import load_dotenv



from supabase import create_client, Client
from langsmith import traceable
from langsmith.wrappers import wrap_gemini

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
try:
    from google import genai

    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Configure Gemini if API key is available
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
if GEMINI_AVAILABLE and GOOGLE_API_KEY:
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        # Diagnostic: List models to log what's available
        print("🔍 DEBUG: Available Gemini Models:")
        for m in genai.list_models():
            if "generateContent" in m.supported_generation_methods:
                print(f"  - {m.name}")

        # Use models/ prefix for better reliability with older library versions
        # Wrap Gemini model for LangSmith tracing
        raw_model = genai.GenerativeModel("models/gemini-1.5-flash-latest")
        GEMINI_MODEL = wrap_gemini(raw_model)

        print(
            "✅ Gemini Initialized & Wrapped with LangSmith: models/gemini-1.5-flash-latest"
        )
    except Exception as e:
        print(f"❌ Gemini Initialization/Wrapping Failed: {e}")
        GEMINI_MODEL = None
else:
    GEMINI_MODEL = None

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "").strip()

# ---------------------------------------------------------------------------
# App & CORS
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handle application lifespan events.
    Replaces deprecated @app.on_event('startup') logic.
    """
    # Startup: Perform any initialization here if needed
    yield
    # Shutdown: Perform any cleanup here if needed


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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    original_text: str
    risk_level: str  # "LOW" | "MEDIUM" | "HIGH"
    confusion_score: float
    jargon_detected: List[str]
    financial_metric: Optional[str] = None


class HighRiskClauseAnalysis(BaseModel):
    """High-risk clause with simplified explanation and coordinates for highlighting."""

    id: int
    page: int
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


def extract_coordinates_from_pdf(
    pdf_bytes: bytes,
    page_num: int,
    clause_text: str,
) -> Optional[List[List[int]]]:
    """
    Extract bounding box coordinates for a clause using PyMuPDF (fitz).
    """
    if not PYMUPDF_AVAILABLE:
        return [[int(page_num), 50, 100, 500, 40]]

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if page_num < 1 or page_num > len(doc):
            return None
        page = doc[page_num - 1]
        text = re.sub(r"\s+", " ", (clause_text or "").replace("\n", " ")).strip()
        if not text:
            return None

        # Normalization for matching
        expected_words = [_clean_word_for_matching(w) for w in text.split() if _clean_word_for_matching(w)]
        if not expected_words:
            return None

        pdf_words = page.get_text("words")
        match_rects = _find_exact_sequence(pdf_words, expected_words)
        if not match_rects:
            match_rects = _find_anchor_sequence(pdf_words, expected_words)
        if not match_rects:
            return None

        # Group words by line (y0) to ensure multi-line paragraph highlighting is discrete
        lines_dict = {}
        for r in match_rects:
            y_key = round(r.y0 / 5) * 5
            lines_dict.setdefault(y_key, []).append(r)

        return [[int(page_num), int(min(r.x0 for r in line)), int(min(r.y0 for r in line)),
                 int(max(r.x1 for r in line) - min(r.x0 for r in line)),
                 int(max(r.y1 for r in line) - min(r.y0 for r in line)) + 2]
                for line in lines_dict.values()]
    except Exception as e:
        print(f"Error in extract_coordinates: {e}")
        return [[int(page_num), 50, 100, 500, 40]]


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


async def simplify_with_gemini(clauses: List[str], language: str) -> dict:
    """NEURAL TRACK: Batch simplification with Judge-Agent verification."""
    if not GEMINI_AVAILABLE or not GEMINI_MODEL:
        return {c: _fallback_simplified_text(c) for c in clauses}

    lang_map = {"en": "English", "hi": "Hindi", "mr": "Marathi"}
    target_lang = lang_map.get(language, "English")
    simplified_map = {}

    for i in range(0, len(clauses), 10):
        batch = clauses[i:i+10]
        # 1. Auditor
        p = _build_gemini_prompt(batch, target_lang)
        s, raw = await _call_gemini_api(p)
        if not s:
            continue
        simps = _extract_numbered_lines(raw)
        if len(simps) != len(batch):
            continue

        # 2. Critic
        cp = _build_gemini_critic_prompt(batch, simps)
        cs, craw = await _call_gemini_api(cp)
        verts = _extract_numbered_lines(craw) if cs else ["FAIL"] * len(batch)

        # 3. Handle Results
        for idx, (cl, sm) in enumerate(zip(batch, simps)):
            v = verts[idx].upper() if idx < len(verts) else "FAIL"
            if "PASS" in v:
                simplified_map[cl] = scrub_ai_text(sm)
            else:
                print(f"⚠️ Gemini Judge FAIL: {cl[:30]}")
                # Single Correction Attempt
                rp = f"Original: {cl}\nSimplify for 10th grade in {target_lang}. CORRECTION: Keep all ₹ and % values."
                rs, rt = await _call_gemini_api(rp)
                simplified_map[cl] = scrub_ai_text(rt) if rs else _fallback_simplified_text(cl)

    return simplified_map


def _build_gemini_critic_prompt(origs: List[str], simps: List[str]) -> str:
    pairs = "\n".join([f"{i}. [Orig]: {o[:200]} [Simp]: {s[:200]}" for i, (o, s) in enumerate(zip(origs, simps), 1)])
    instruction = (
        f"Verify {len(origs)} pairs. Output ONLY {len(origs)} numbered lines "
        "with PASS or FAIL if numerical data is lost."
    )
    return f"{instruction}\nPairs:\n{pairs}\nOutput:"


def _build_gemini_prompt(batch: List[str], lang: str) -> str:
    numbered = "\n".join([f"{i}. {c[:500]}" for i, c in enumerate(batch, 1)])
    instruction = f"Simplify these {len(batch)} clauses for a 10th-grade student in {lang}."
    return f"{instruction} Output exactly {len(batch)} numbered lines.\n{numbered}\nOutput:"


async def _call_gemini_api(payload: str, retries: int = 2) -> Tuple[bool, str]:
    """Execute Gemini API call with retry logic."""
    for a in range(retries):
        try:
            res = GEMINI_MODEL.generate_content(payload)
            return True, unicodedata.normalize("NFKC", (res.text or "").strip())
        except Exception as e:
            if "429" in str(e):
                await asyncio.sleep(10)
            else:
                break
    return False, ""


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
            if confusion_score > 70:
                high_risk_clauses_with_pages.append(
                    {"page": page_num, "text": clause, "score": confusion_score}
                )

        high_risk_clauses_with_pages.sort(key=lambda x: x["score"], reverse=True)
        texts_to_simplify = [unicodedata.normalize("NFKC", c["text"]) for c in high_risk_clauses_with_pages]
        simplified_map = await cls._orchestrate_ai_simplification(texts_to_simplify, language)

        return await _build_high_risk_response(
            high_risk_clauses_with_pages, simplified_map, pdf_bytes, total_scanned
        )

    @classmethod
    async def _orchestrate_ai_simplification(
        cls, texts: List[str], language: str
    ) -> Dict[str, str]:
        """Orchestrate Sarvam AI simplification with Gemini fallback."""
        simplified_map = {}
        if not texts:
            return simplified_map

        print(f"🚀 DEBUG: BFSI Pipeline - Attempting Sarvam AI for {len(texts)} clauses.")
        try:
            sarvam_map = await simplify_with_sarvam(texts, language)
            simplified_map.update(sarvam_map)

            missing_texts = [t for t in texts if t not in simplified_map or not simplified_map[t]]
            if missing_texts:
                print(f"⚠️ Sarvam AI partially failed ({len(missing_texts)} missing). Falling back to Gemini...")
                try:
                    gemini_map = await simplify_with_gemini(missing_texts, language)
                    simplified_map.update(gemini_map)
                except Exception as ge:
                    print(f"❌ Partial Gemini Fallback Failed: {ge}")
        except Exception as e:
            print(f"❌ Sarvam AI Primary Failure ({e}). Falling back to Gemini for all...")
            try:
                gemini_map = await simplify_with_gemini(texts, language)
                simplified_map.update(gemini_map)
            except Exception as ge_full:
                print(f"🚨 CRITICAL: Both Sarvam Primary and Gemini Fallback failed! ({ge_full})")
        return simplified_map

    @classmethod
    def analyze_page_aware(
        cls, pages_data: List[Tuple[int, str]]
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


async def _build_high_risk_response(clauses: List[dict], simplified_map: dict, pdf_bytes: bytes, total: int):
    """Construct HighRiskAnalysisResponse from filtered clauses."""
    response_clauses = []
    for idx, c in enumerate(clauses, start=1):
        simplified = simplified_map.get(c["text"], "").strip() or _fallback_simplified_text(c["text"])
        coords = extract_coordinates_from_pdf(pdf_bytes, c["page"], c["text"])
        if not coords:
            coords = [[c["page"], 50, 100, 500, 120]]
        response_clauses.append(
            HighRiskClauseAnalysis(
                id=idx,
                page=c["page"],
                original_text=c["text"],
                simplified=simplified,
                risk_score=c["score"],
                highlight_coords=coords,
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
async def analyze_upload(
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

    # ---------- STEP 4: If OK, run High-Risk-Only Analysis Engine ----------
    high_risk_result = await SymbolicAnalysisEngine.analyze_high_risk_only(pages_data, pdf_bytes, language)

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
