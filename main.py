from __future__ import annotations
import uuid
import io
import os
from dotenv import load_dotenv
load_dotenv()
import re
import json
import time
from datetime import datetime
import hashlib
import concurrent.futures
import asyncio
import unicodedata
import gc
import httpx
from typing import Optional, Set, Tuple, List, Dict, Any
from supabase import create_client, Client

import pdfplumber
import spacy
import textstat
from fastapi import FastAPI, File, HTTPException, UploadFile, Query, Form, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from compliance_engine import MathematicalRiskEngine, extract_text_with_layout, reconstruct_text_healer

# PyMuPDF (optional, graceful fallback if not configured)
try:
  import fitz  # PyMuPDF
  PYMUPDF_AVAILABLE = True
except ImportError:
  PYMUPDF_AVAILABLE = False

# Gemini API (optional, graceful fallback if not configured)
try:
  import google.generativeai as genai
  GEMINI_AVAILABLE = True
except ImportError:
  GEMINI_AVAILABLE = False

# Configure Gemini if API key is available
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
if GEMINI_AVAILABLE and GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    GEMINI_MODEL = genai.GenerativeModel("gemini-1.5-flash")
else:
    GEMINI_MODEL = None

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "").strip()

# ---------------------------------------------------------------------------
# App & CORS
# ---------------------------------------------------------------------------

app = FastAPI(title="AVAGAMYA Security Ingestion Layer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.31.137:5173", "https://avagamya.vercel.app", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Cloud Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("Warning: Missing Supabase Credentials")

def log_dpo_event(filename: str, status: str, details: str, processing_time: float = 0.0, language_detected: str = "Unknown", unique_hash: str = "", risk_score: str = ""):
  """
  Log a DPO audit event to Supabase cloud.
  
  Args:
    filename: Name of the uploaded file
    status: "BLOCKED" or "CLEAN"
    details: Description of the event (e.g., "PII Detected (Credit Card/PAN)")
    processing_time: Time taken to process the document
    language_detected: The language of the document
    unique_hash: SHA-256 hash of the document content
    risk_score: Aggregated risk score or metrics
  """
  try:
      payload = {
          "timestamp": datetime.now().isoformat(),
          "filename": filename,
          "status": status,
          "details": details,
          "processing_time": processing_time,
          "language_detected": language_detected,
          "unique_hash": unique_hash,
          "risk_score": risk_score
      }
      supabase.table("compliance_logs").insert(payload).execute()
  except Exception as e:
      print(f"Supabase logging failed: {e}")

@app.on_event("startup")
async def startup_event():
  """FastAPI startup configurations."""
  pass

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
  highlight_coords: Optional[List[List[int]]] = None  # [[page, x, top_y, width, height], ...] for multi-line red highlight


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


def extract_coordinates_from_pdf(
  pdf_bytes: bytes,
  page_num: int,
  clause_text: str,
) -> Optional[List[List[int]]]:
  """
  Extract bounding box coordinates for a clause using PyMuPDF (fitz), with
  robust multi-line support.

  Strategy:
  - Normalize clause_text into a list of words stripped of punctuation.
  - Extract all word bounding boxes from the target PDF page.
  - Search for the continuous sequence of words that matches our normalized clause.
  - Group matching word rectangles vertically by line (`y0` coordinate matching).
  - Merge the line-specific rectangles into discrete bounded boxes so highlights never stretch across column gutters.
  """
  if not PYMUPDF_AVAILABLE:
    return [[int(page_num), 50, 100, 500, 40]]

  try:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if page_num < 1 or page_num > len(doc):
      return None

    page = doc[page_num - 1]

    # --- 1) Clean and normalize the clause text ---
    # We remove extra spaces and newlines to find matches that wrap across multiple lines
    text = (clause_text or "").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
      return None

    # Normalization for matching
    def clean_word(w):
        # Normalize Unicode to fix Devanagari character breaking/clustering differences
        w_norm = unicodedata.normalize('NFKC', w)
        return re.sub(r"[^\w\u0900-\u097F]", "", w_norm.lower())

    expected_words = [clean_word(w) for w in text.split() if clean_word(w)]
    if not expected_words:
        return None

    # --- 2) Retrieve PDF words and sequence matching ---
    pdf_words = page.get_text("words") # (x0, y0, x1, y1, word, block_no, line_no, word_no)
    
    match_rects = []
    seq_len = len(expected_words)
    
    for i in range(len(pdf_words) - seq_len + 1):
        window = pdf_words[i : i + seq_len]
        window_words = [clean_word(w[4]) for w in window]
        
        # Exact Fuzzy String Mapping logic
        if window_words == expected_words:
            # We found the block! Extract all rects
            for w in window:
                match_rects.append(fitz.Rect(w[0], w[1], w[2], w[3]))
            break

    if not match_rects:
      # Anchor-Point Geometric Highlighting: search for first 3 and last 3 words
      if len(expected_words) >= 6:
          start_anchor = expected_words[:3]
          end_anchor = expected_words[-3:]
          
          start_idx = -1
          end_idx = -1
          
          # Find start
          for i in range(len(pdf_words) - 2):
              window = pdf_words[i : i + 3]
              if [clean_word(w[4]) for w in window] == start_anchor:
                  start_idx = i
                  break
                  
          # Find end
          if start_idx != -1:
              for i in range(start_idx, len(pdf_words) - 2):
                  window = pdf_words[i : i + 3]
                  if [clean_word(w[4]) for w in window] == end_anchor:
                      end_idx = i + 2
                      break
                      
          if start_idx != -1 and end_idx != -1:
              for i in range(start_idx, end_idx + 1):
                  match_rects.append(fitz.Rect(pdf_words[i][0], pdf_words[i][1], pdf_words[i][2], pdf_words[i][3]))

    if not match_rects:
      return None

    # --- 3) Geometric merging of all rectangles by line ---
    # We group words by their vertical y0 axis (with a small fuzziness threshold) to ensure 
    # multi-line paragraphs don't create a massive single box that covers empty gutters.
    lines_dict = {}
    for r in match_rects:
        # Round y0 to nearest 5 points to group words on the same line
        y_key = round(r.y0 / 5) * 5
        if y_key not in lines_dict:
            lines_dict[y_key] = []
        lines_dict[y_key].append(r)
        
    final_rects = []
    for y_key, rects in lines_dict.items():
        min_x0 = min(r.x0 for r in rects)
        min_y0 = min(r.y0 for r in rects)
        max_x1 = max(r.x1 for r in rects)
        max_y1 = max(r.y1 for r in rects)
        
        x = int(min_x0)
        y = int(min_y0)
        width = int(max_x1 - min_x0)
        height = int(max_y1 - min_y0) + 2
        
        final_rects.append([int(page_num), x, y, width, height])
        
    return final_rects

  except Exception as e:
    print(f"Error in extract_coordinates: {e}")
    return [[int(page_num), 50, 100, 500, 40]]


def _fallback_simplified_text(clause: str) -> str:
  """
  Build a deterministic fallback message that references the detected financial metric
  so the UI always has a non-empty 'simplified' field for high-risk clauses.
  """
  metric = SymbolicAnalysisEngine.detect_financial_metrics(clause)  # type: ignore[name-defined]
  if metric:
    return f"Detailed analysis pending. Please check original text for {metric}."
  return "Detailed analysis pending. Please check original text for key fees and rates."


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
    c for c in out
    if c == "\n" or (ord(c) >= 32 and ord(c) != 127) or c in "\t\r"
  )
  return out.strip()


def _extract_numbered_lines(response_text: str) -> List[str]:
  """
  Extract translated lines from a numbered-list response.
  Keeps only lines that start with a digit; strips the number prefix (e.g. "1. " or "2. ").
  """
  raw_lines = (response_text or "").strip().split("\n")
  lines = [
    line.split(".", 1)[-1].strip()
    for line in raw_lines
    if line.strip() and line.strip()[0].isdigit()
  ]
  return lines


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
      "api-subscription-key": SARVAM_API_KEY
  }

  prompt_template = f"""You are a Financial Auditor.
Task: Simplify this banking clause for a 10th-grade student in {target_language}.
STRICT RULE: Output ONLY the simplified sentence. Do NOT include any introductory phrases (like 'Here is a simplified...') or closing remarks. Preserve all ₹ and % values."""

  async def process_single_clause(client: httpx.AsyncClient, clause: str) -> Tuple[str, str]:
      payload = {
          "model": "sarvam-m", # Upgraded to Sarvam's completions endpoint parameter format
          "messages": [
              {"role": "system", "content": prompt_template},
              {"role": "user", "content": clause}
          ],
          "temperature": 0.3
      }
      try:
          response = await client.post(url, json=payload, headers=headers)
          response.raise_for_status()
          data = response.json()
          raw_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
          
          if raw_text:
              # Fix Devanagari character clustering on incoming LLM generation
              clean_text = unicodedata.normalize('NFKC', raw_text.strip())
              # Backend Regex Cleaner (The Safety Net)
              clean_text = re.sub(r"^(here's|here is|this is|simplified clause|simplified version).*?:\s*", "", clean_text, flags=re.IGNORECASE).strip()
              return (clause, clean_text)
          else:
              return (clause, _fallback_simplified_text(clause))
      except Exception as e:
          print(f"❌ SARVAM COMPLETION ERROR: {e}")
          return (clause, _fallback_simplified_text(clause))

  async with httpx.AsyncClient(timeout=45.0) as client:
      # Fire all clause translation requests simultaneously
      tasks = [process_single_clause(client, clause) for clause in clauses]
      results = await asyncio.gather(*tasks)
      
      for clause_key, simplified_val in results:
          sarvam_map[clause_key] = simplified_val
              
  return sarvam_map

async def simplify_with_gemini(clauses: List[str], language: str) -> dict:
  """
  NEURAL TRACK: Batch simplification using Gemini 1.5 Flash.
  Quota-Safe logic with dynamic numbering and resilient async retries.
  """
  if not GEMINI_AVAILABLE or not GOOGLE_API_KEY or GEMINI_MODEL is None:
    raise RuntimeError("Gemini is unavailable or not configured.")

  if not clauses:
    return {}

  lang_map = {"en": "English", "hi": "Hindi", "mr": "Marathi"}
  target_language = lang_map.get((language or "").strip().lower(), "English")

  simplified_map: Dict[str, str] = {}
  batch_size = 10

  for batch_start in range(0, len(clauses), batch_size):
    batch = clauses[batch_start:batch_start + batch_size]
    count = len(batch)
    print(f"🚀 DEBUG: Sending {count} clauses to Gemini 1.5 Flash...")

    # Token Minimization: No-Chatter prompt
    prompt_template = f"""You are a Financial Auditor.
Task: Simplify this banking clause for a 10th-grade student in {target_language}.
STRICT RULE: Output ONLY the simplified sentence. Do NOT include any introductory phrases (like 'Here is a simplified...') or closing remarks. Preserve all ₹ and % values.
Output EXACTLY {count} numbered lines.

Clauses:
{{numbered_clauses}}

Output:"""

    numbered_clauses = "\n".join(
      # Apply NFKC to directly protect Devanagari text inside the prompt payload
      f"{i}. {unicodedata.normalize('NFKC', c.strip()[:500])}"
      for i, c in enumerate(batch, start=1)
    )
    
    # Enforce UTF-8 encoding implicitly in python strings, but we can explicitly encode/decode if needed
    # Standard python3 string is Unicode, so it's safe for transmission
    payload = prompt_template.format(numbered_clauses=numbered_clauses)

    max_retries = 2
    raw_text = ""
    success = False

    for attempt in range(max_retries):
      try:
        response = GEMINI_MODEL.generate_content(payload)
        raw_text = (response.text or "").strip()
        # Fix Devanagari clustering on response
        raw_text = unicodedata.normalize('NFKC', raw_text)
        print(f"DEBUG: Gemini Response -> {raw_text[:100]}...")
        success = True
        break
      except Exception as e:
        error_str = str(e)
        print(f"❌ GEMINI API CRITICAL ERROR: {error_str}")
        if "429" in error_str and attempt < max_retries - 1:
          await asyncio.sleep(12)
        else:
          break

    if not success:
      # Trigger fallback on total failure
      raise RuntimeError("Gemini API exhausted retries or failed.")

    lines = _extract_numbered_lines(raw_text)

    if len(lines) != count:
      # Fallback for this batch so we don't map mismatched counts
      raise RuntimeError(f"Gemini output count mismatch: expected {count}, got {len(lines)}")
    else:
      for clause, translation in zip(batch, lines):
        stripped = translation[:500].strip()
        # Backend Regex Cleaner (The Safety Net)
        stripped = re.sub(r"^(here's|here is|this is|simplified clause|simplified version).*?:\s*", "", stripped, flags=re.IGNORECASE).strip()
        
        if not stripped:
            raise RuntimeError("Gemini returned empty or invalid translation strings.")
        simplified_map[clause] = stripped

  print(f"✅ DEBUG: Gemini successfully simplified {len(simplified_map)} clauses.")
  return simplified_map


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
  global ALLOWED_EMAIL_DOMAINS, ALLOWED_CONTACT_NUMBERS

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
    "liable", "liability", "indemnify", "indemnification", "forfeit",
    "discretion", "levy", "charge", "penalty", "default", "breach",
    "terminate", "termination", "cancel", "cancellation", "refuse",
    "refuse to", "deny", "denial", "waive", "waiver", "forfeiture",
    "lien", "claim", "dispute", "arbitration", "jurisdiction", "governing law",
    "sole discretion", "absolute discretion", "at its discretion", "may refuse",
    "shall not be liable", "not liable", "no liability", "unlimited liability",
    # Marathi risk indicators
    "जबाबदार", "दंड", "नुकसानभरपाई", "रद्द", "अस्वीकार", "अटी",
    "दायित्व", "बंधने", "अधिकार", "क्षेत्राधिकार", "थकीत", "अंतिम",
    # Hindi risk indicators
    "उत्तरदायी", "जुर्माना", "हर्जाना", "रद्द", "अस्वीकृत", "शर्तें",
    "प्रतिबंध", "बकाया", "अनिवार्य"
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
    
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        
        # 1. TABLE DATA FILTER: >30% digits/currency = discard
        digit_currency_chars = sum(1 for c in line if c.isdigit() or c in '₹%,.-')
        if len(line) > 0 and digit_currency_chars / len(line) > 0.30:
            continue
        
        # 2. NAVIGATION FILTER: Common navigation patterns
        if re.search(r'\b(page|pages?)\s+\d+|\bwww\.|\.com\b|toll\s*free|helpline|contact\s*us', line, re.IGNORECASE):
            continue
        
        # 3. HEADER FILTER: ALL CAPS + under 10 words = discard
        if line.isupper() and len(line.split()) < 10:
            continue
            
        # 4. TEMPLATE DATA FILTER: Discard placeholder values like ₹X-Y, consecutive placeholders, etc.
        if re.search(r"₹\s*[A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9]+)+", line) or re.search(r"(?:[_.X]{2,}\s*)+", line):
            continue
        
        cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines)


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
    merged = f"{previous} {current}" if not previous.endswith('.') else f"{previous} {current}"
    
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


def semantic_segment_and_validate(text: str, confusion_threshold: float = 70.0) -> List[str]:
    """
    INTEGRATED SEMANTIC VALIDATOR PIPELINE:
    
    1. Advanced Clean: Remove junk, tables, headers
    2. Segment: Split into clauses using spaCy
    3. Validate: Check each clause for grammar (verb + subject)
    4. Merge: Try to merge fragments with previous clause
    5. Filter: Keep only clauses with risk keywords + high confusion
    
    Returns list of validated clauses ready for risk analysis.
    """
    # Phase 1: Advanced Clean
    cleaned_text = advanced_clean(text)
    if not cleaned_text.strip():
        return []
    
    # Phase 2: Segment using spaCy
    doc = nlp(cleaned_text)
    raw_clauses = [sent.text.strip() for sent in doc.sents]
    
    validated_clauses = []
    i = 0
    
    while i < len(raw_clauses):
        clause = raw_clauses[i]
        
        # 1. Minimum Word Count Filter: Must have at least 8 words.
        if len(clause.split()) < 8:
            i += 1
            continue
            
        # Phase 3: Validate grammar or check if Devanagari text is present
        is_regional = bool(re.search(r"[\u0900-\u097F]", clause))
        
        if is_regional:
            # Regional Path: Strict bypass for English grammar check
            has_risk = has_risk_keywords(clause)
            
            # Check for financial marker (₹ or % or indicated numerals) and any Jargon
            has_financial = bool(re.search(r'[₹%०-९]', clause))
            jargon_found = SymbolicAnalysisEngine.detect_jargon(clause)
            
            # Strict logic: Must have Risk AND Financial OR 2+ Risk keywords.
            risk_keyword_count = sum(1 for keyword in RISK_KEYWORDS if keyword in clause.lower())
            
            if (has_risk and (has_financial or len(jargon_found) > 0)) or (risk_keyword_count >= 2):
                # Script-Specific Risk Scoring: Bypass textstat entirely
                confusion_score = 85.0
                validated_clauses.append(clause)
                
        elif semantic_validator(clause):
            # English Path (Unchanged): Valid English clause - calculate confusion score
            confusion_score = SymbolicAnalysisEngine.calculate_confusion_index(clause)
            
            # Phase 4: Filter by risk keywords + confusion threshold
            if has_risk_keywords(clause) and confusion_score > confusion_threshold:
                validated_clauses.append(clause)
        
        else:
            # Invalid English clause (fragment) - try to merge with previous
            if validated_clauses:
                # Merge with the last validated clause
                merged = merge_with_previous(clause, validated_clauses[-1])
                
                if merged:
                    merged_is_regional = bool(re.search(r"[\u0900-\u097F]", merged))
                    
                    if merged_is_regional:
                        # Re-run Regional Path Strict check
                        if len(merged.split()) >= 8:
                            merged_risk_count = sum(1 for kw in RISK_KEYWORDS if kw in merged.lower())
                            merged_fino = bool(re.search(r'[₹%०-९]', merged))
                            merged_jargon = SymbolicAnalysisEngine.detect_jargon(merged)
                            if (has_risk_keywords(merged) and (merged_fino or len(merged_jargon) > 0)) or (merged_risk_count >= 2):
                                validated_clauses[-1] = merged
                    else:
                        # Re-run English Path check
                        confusion_score = SymbolicAnalysisEngine.calculate_confusion_index(merged)
                        if has_risk_keywords(merged) and confusion_score > confusion_threshold:
                            validated_clauses[-1] = merged
            
            # If merge failed or no previous clause, discard this fragment
        
        i += 1
    
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
      "late fee", "default", "charge", "penalty", "fine", "late payment",
      "defaulted", "defaulting", "penalties", "charges", "fines", "fees",
      # Hindi / Marathi equivalents
      "दंड", "विलंब शुल्क", "जुर्माना", "शुल्क"
    ],
    "interest": [
      "apr", "p.a.", "interest", "per annum", "finance charge", "interest rate",
      "annual percentage rate", "rate of interest", "percentage per annum",
      "compound interest", "simple interest", "accrued interest",
      # Hindi / Marathi equivalents
      "व्याज", "व्याज दर", "ब्याज", "ब्याज दर"
    ],
    "legal": [
      "indemnify", "liable", "jurisdiction", "arbitration", "sole discretion",
      "liability", "liable for", "indemnification", "indemnified", "indemnifying",
      "arbitrator", "arbitrate", "legal jurisdiction", "governing law",
      "exclusive jurisdiction", "legal venue", "legal recourse",
      # Hindi / Marathi equivalents
      "जबाबदार", "नुकसानभरपाई", "कायदेशीर", "दायित्व", "हर्जाना",
      "बंधने", "अधिकार", "क्षेत्राधिकार", "थकीत", "अंतिम",
      "शर्तें", "प्रतिबंध", "बकाया", "अनिवार्य"
    ]
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
      r'page\s*\d+',
      r'https?://',
      r'www\.',
      r'^\d+\.\d+$',
      r'^[\d\s\.]+$',
    ]
    nav_regex = re.compile('|'.join(nav_patterns), re.IGNORECASE)

    for sent in doc.sents:
      clause = sent.text.strip()
      
      # Clean excess whitespace
      clause = re.sub(r"\s+", " ", clause)
      
      # Skip navigational/noise text
      if nav_regex.search(clause):
        continue
      
      # Filter: Must have at least 7 words UNLESS contains financial markers
      words = clause.split()
      has_financial_marker = bool(re.search(r'[₹Rs%]', clause)) or bool(re.search(r'\bfee\b', clause, re.IGNORECASE))
      
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
    
    NEW 5-PHASE APPROACH:
    1. Advanced Clean: Remove junk, tables, headers
    2. Semantic Validation: Grammar check (verb + subject) + risk keywords
    3. The Gatekeeper: Filter to confusion > 70
    4. The Translator: Gemini simplification
    5. Coordinates: PDF highlighting
    
    ELIMINATES: Fragments, junk text, table data, navigation text
    KEEPS ONLY: Grammatically complete high-risk clauses
    
    Returns: Only HIGH RISK clauses with simplified text and coordinates
    """
    
    # Combine all text for analysis
    all_text = "\n\n".join([text for _, text in pages_data])
    
    if not all_text.strip():
      return HighRiskAnalysisResponse(
        status="ANALYSIS_COMPLETE",
        pii_result="OK",
        meta={"total_scanned": 0, "high_risk_found": 0},
        high_risk_clauses=[]
      )
    
    # PHASE 1-5: Semantic Validation Pipeline
    # This replaces basic segment_clauses with advanced cleaning + grammar validation
    # validated_clauses_all is deprecated since we build from pages
    
    # Step 2: Map validated clauses to pages IN PARALLEL
    clauses_with_pages = []
    
    # [OOM Fix] Process sequentially instead of ProcessPoolExecutor to prevent RAM spikes
    for page in pages_data:
        clauses_with_pages.extend(process_pdf_page_semantic_parallel(page))
    
    total_scanned = len(clauses_with_pages)
    
    # Step 3: All clauses from semantic validator already pass:
    #         - Grammar check (verb + subject)
    #         - Risk keywords check
    #         - Confusion > 70
    # So we can directly use them as high-risk clauses
    
    high_risk_clauses_with_pages = []
    
    for page_num, clause in clauses_with_pages:
      # Double-check confusion score (should already be > 70 from validator)
      confusion_score = cls.calculate_confusion_index(clause)
      
      if confusion_score > 70:  # Sanity check
        high_risk_clauses_with_pages.append({
          "page": page_num,
          "text": clause,
          "score": confusion_score
        })
    
    # Sort clauses strictly descending by risk_score so highest risk is processed first
    high_risk_clauses_with_pages.sort(key=lambda x: x["score"], reverse=True)
    
    # Step 4: THE HYBRID TRANSLATOR - Gemini (Top 5) + Sarvam AI (Remainder)
    simplified_map = {}
    if high_risk_clauses_with_pages:
      # Unicode Normalization Guard: Apply NFKC before sending text to engines
      # Slice top 5 for Gemini Simplification
      top_5_clauses = high_risk_clauses_with_pages[:5]
      gemini_texts = [unicodedata.normalize('NFKC', c["text"]) for c in top_5_clauses]
      
      remainder = high_risk_clauses_with_pages[5:]
      sarvam_texts = [unicodedata.normalize('NFKC', c["text"]) for c in remainder]
      
      print(f"⚖️ DEBUG: Routing Top 5 to Gemini and {len(remainder)} to Sarvam AI.")
      
      if gemini_texts:
          print(f"🚀 DEBUG: Processing {len(gemini_texts)} via Gemini.")
          try:
              gemini_map = await simplify_with_gemini(gemini_texts, language)
              simplified_map.update(gemini_map)
          except Exception as e:
              print(f"⚠️ Gemini Failed. Re-routing {len(top_5_clauses)} critical clauses to Sarvam AI...")
              sarvam_texts = gemini_texts + sarvam_texts

      if sarvam_texts:
          print(f"🚀 DEBUG: Processing {len(sarvam_texts)} via Sarvam.")
          sarvam_map = await simplify_with_sarvam(sarvam_texts, language)
          simplified_map.update(sarvam_map)
    
    # Step 5: Extract coordinates and build response
    high_risk_response_clauses = []
    
    for idx, clause_data in enumerate(high_risk_clauses_with_pages, start=1):
      page_num = clause_data["page"]
      clause_text = clause_data["text"]
      confusion_score = clause_data["score"]
      
      # Get simplified version
      simplified = simplified_map.get(clause_text, "").strip()
      if not simplified:
        simplified = _fallback_simplified_text(clause_text)
      
      # Extract coordinates for highlighting
      coords = extract_coordinates_from_pdf(pdf_bytes, page_num, clause_text)
      if not coords:
        coords = [[page_num, 50, 100, 500, 120]]  # Fallback
      
      high_risk_response_clauses.append(
        HighRiskClauseAnalysis(
          id=idx,
          page=page_num,
          original_text=clause_text,
          simplified=simplified,
          risk_score=confusion_score,
          highlight_coords=coords
        )
      )
    
    # Step 6: Return filtered response
    return HighRiskAnalysisResponse(
      status="ANALYSIS_COMPLETE",
      pii_result="OK",
      meta={
        "total_scanned": total_scanned,
        "high_risk_found": len(high_risk_response_clauses)
      },
      high_risk_clauses=high_risk_response_clauses
    )

  @classmethod
  def analyze_page_aware(
    cls, 
    pages_data: List[Tuple[int, str]]
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
        meta={
          "total_clauses": 0,
          "high_risk_count": 0,
          "avg_complexity": 0.0
        },
        analysis=[]
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
        meta={
          "total_clauses": 0,
          "high_risk_count": 0,
          "avg_complexity": 0.0
        },
        analysis=[]
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
        financial_metric=financial_metric
      )
      analysis_list.append(clause_analysis)

    # Step 3: Calculate averages
    avg_confusion = (
      round(total_confusion / len(clauses_with_pages), 2) 
      if clauses_with_pages else 0.0
    )

    # Step 4: Build response
    return SymbolicAnalysisResponse(
      status="ANALYSIS_COMPLETE",
      pii_result="OK",
      meta={
        "total_clauses": len(clauses_with_pages),
        "high_risk_count": high_risk_count,
        "avg_complexity": avg_confusion
      },
      analysis=analysis_list
    )




# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@app.post("/analyze/upload", response_model=HighRiskAnalysisResponse)
async def analyze_upload(
  language: str = Query(..., description="User-selected language code"),
  file: UploadFile = File(...),
) -> HighRiskAnalysisResponse:
  """
  HIGH-RISK-ONLY Analysis Endpoint for AVAGAMYA v3.

  Pipeline:
  1. Extract text from PDF page-by-page (with page tracking)
  2. Run PII security check
  3. IF BLOCKED: Return error response immediately
  4. IF OK: Run High-Risk-Only Analysis Engine:
     - THE GATEKEEPER: Filter to ONLY HIGH RISK clauses (confusion > 70 + 15+ words or financial marker)
     - THE TRANSLATOR: Simplify high-risk clauses with Gemini 1.5 Flash
     - Coordinate Extraction: Get bounding boxes for PDF red underlines
  5. Return structured analysis with:
     - ONLY HIGH RISK clauses (no LOW/MEDIUM)
     - Simplified explanations (Grade 10 level)
     - Page numbers and highlight coordinates for PDF overlay
     - Meta showing total_scanned vs high_risk_found

  Input:
  - file: PDF document
  - language: User language preference (en/hi/mr, used for future localization)

  Output:
  - HighRiskAnalysisResponse with only high-risk clauses, simplified text, and coordinates
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
  if not pdf_bytes:
    raise HTTPException(status_code=400, detail="Empty document.")
    
  if len(pdf_bytes) > 5 * 1024 * 1024:
    del pdf_bytes
    gc.collect()
    raise HTTPException(status_code=413, detail="Payload Too Large. Free tier limit is 5MB.")
    
  # Data Integrity - Tamper Proof Hash
  unique_hash = hashlib.sha256(pdf_bytes).hexdigest()

  try:
    # Extract all text (for PII check)
    all_text = extract_text_with_layout(pdf_bytes)
    # Lattice-aware extraction + sentence healing (tables → contextual rows; body merged)
    pages_data = reconstruct_text_healer(pdf_bytes)
  except Exception as exc:  # pragma: no cover (safety net)
    raise HTTPException(
      status_code=500,
      detail=f"Failed to extract text from PDF: {exc}",
    ) from exc

  if not all_text.strip():
    raise HTTPException(
      status_code=400,
      detail="Could not extract any text from the document.",
    )

  # Detect issuer from content
  issuer = detect_issuer(all_text)

  # ---------- STEP 1: Run PII Security Check ----------
  pii_result = scan_for_pii(all_text, issuer)
  
  # ---------- STEP 2: If BLOCKED, return immediately ----------
  if pii_result.status == "BLOCKED":
    processing_time = round(time.time() - start_time, 2)
    # Log blocked event to DPO audit database
    log_dpo_event(
      filename=file.filename or "unknown.pdf",
      status="BLOCKED",
      details="PII Detected (e.g., Credit Card/PAN)",
      processing_time=processing_time,
      language_detected=language,
      unique_hash=unique_hash,
      risk_score="CRITICAL (Blocked)"
    )
    
    # Flush memory immediately upon blocked exit
    del all_text
    del pdf_bytes
    if 'pages_data' in locals():
      del pages_data
    gc.collect()
    
    return HighRiskAnalysisResponse(
      status="BLOCKED",
      pii_result="BLOCKED",
      meta={"total_scanned": 0, "high_risk_found": 0},
      high_risk_clauses=[]
    )
  
  # Free all_text as it is no longer required
  del all_text
  gc.collect()
  
  # ---------- STEP 3: If OK, run High-Risk-Only Analysis Engine ----------
  # pages_data is lattice-aware + healed (structurally complete sentences)
  high_risk_result = await SymbolicAnalysisEngine.analyze_high_risk_only(
    pages_data, pdf_bytes, language
  )
  
  processing_time = round(time.time() - start_time, 2)
  high_risk_count = high_risk_result.meta.get("high_risk_found", 0)
  risk_score_str = f"{high_risk_count} High Risk Clauses" if high_risk_count > 0 else "Low Risk"
  
  # Log clean event to DPO audit database
  log_dpo_event(
    filename=file.filename or "unknown.pdf",
    status="CLEAN",
    details="No sensitive PII detected",
    processing_time=processing_time,
    language_detected=language,
    unique_hash=unique_hash,
    risk_score=risk_score_str
  )
  
  # Final Garbage Collection Flush
  del pdf_bytes
  del pages_data
  gc.collect()
  
  return JSONResponse(
      content=high_risk_result.model_dump(),
      media_type="application/json"
  )

@app.get("/analyze/dpo/logs")
async def get_dpo_logs():
  """
  Retrieve recent DPO audit logs from Supabase database for the Recent Activity Stream.
  
  Returns:
    JSON list of the last 10 audit logs, ordered by timestamp descending (most recent first).
  """
  try:
      response = supabase.table("compliance_logs").select("*").order("timestamp", desc=True).limit(10).execute()
      return response.data
  except Exception as e:
      print(f"Failed to fetch logs from Supabase: {e}")
      return []


@app.get("/audit/summary")
async def get_audit_summary():
  """
  Retrieve real-time audit summary aggregating live data from the Supabase compliance_logs table.
  Returns:
    Total processed count
    Current DPDP compliance percentage (Clean/Total)
    Average processing time for the last 50 documents
  """
  try:
      # Total Processed Count (Fetch all, or you can use count methods if preferred)
      # For simplicity and given typical sizes, fetching all or using exact counts
      count_resp = supabase.table("compliance_logs").select("*", count="exact").execute()
      total_count = count_resp.count if count_resp.count is not None else len(count_resp.data)

      # Clean Count
      clean_resp = supabase.table("compliance_logs").select("*", count="exact").eq("status", "CLEAN").execute()
      clean_count = clean_resp.count if clean_resp.count is not None else len(clean_resp.data)

      compliance_percentage = 0.0
      if total_count > 0:
          compliance_percentage = round((clean_count / total_count) * 100, 2)

      # Average processing time for the last 50
      recent_resp = supabase.table("compliance_logs").select("processing_time").order("timestamp", desc=True).limit(50).execute()
      recent_times = [row["processing_time"] for row in recent_resp.data if row.get("processing_time") is not None]

      avg_time = 0.0
      if recent_times:
          avg_time = round(sum(recent_times) / len(recent_times), 2)

      return {
          "total_processed": total_count,
          "compliance_percentage": compliance_percentage,
          "avg_processing_time_last_50": avg_time
      }
  except Exception as e:
      print(f"Failed to calculate audit summary: {e}")
      return {
          "total_processed": 0,
          "compliance_percentage": 0.0,
          "avg_processing_time_last_50": 0.0
      }


def process_pdf_page_parallel(page_data: Tuple[int, str]) -> List[Dict]:
    """Standalone worker function for ProcessPoolExecutor to map across PDF pages."""
    page_num, raw_text = page_data
    page_results = []
    
    # Mathematical segmenter built to run per-process
    raw_clauses = MathematicalRiskEngine.segment_clauses(raw_text)
    
    for text in raw_clauses:
        if len(text.split()) < 8: continue # Anti-Nonsense Filter
        
        # Zero Gemini mathematical scoring
        score, jargon = MathematicalRiskEngine.calculate_risk_score(text)
        
        if score >= 40: 
            page_results.append({
                "id": str(uuid.uuid4())[:8],
                "page": page_num,
                "original_text": text,
                "jargon_detected": jargon,
                "mathematical_score": score
            })
            
    return page_results


def process_pdf_page_semantic_parallel(page_data: Tuple[int, str]) -> List[Tuple[int, str]]:
    """Standalone worker for the Semantic Validation pipeline used in /analyze/upload."""
    page_num, raw_text = page_data
    clauses_with_pages = []
    
    # Run the heavy Spacy/Grammar validation pipeline per process
    validated_page_clauses = semantic_segment_and_validate(raw_text, confusion_threshold=70.0)
    for clause in validated_page_clauses:
        clauses_with_pages.append((page_num, clause))
        
    return clauses_with_pages


@app.post("/analyze/compliance/audit")
async def analyze_compliance_audit(file: UploadFile = File(...)):
    start_time = time.time()
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files supported.")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty document.")
        
    if len(pdf_bytes) > 5 * 1024 * 1024:
        del pdf_bytes
        gc.collect()
        raise HTTPException(status_code=413, detail="Payload Too Large. Free tier limit is 5MB.")

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
    risk_score_str = f"{high_risk_count} High Risk" if high_risk_count > 0 else "Low Risk"

    # Log to Supabase
    log_dpo_event(
        filename=file.filename or "unknown.pdf",
        status="CLEAN" if high_risk_count == 0 else "BLOCKED",
        details=f"Compliance Audit: {high_risk_count} High Risk Clauses",
        processing_time=processing_time,
        language_detected="Unknown",
        unique_hash=unique_hash,
        risk_score=risk_score_str
    )
    
    # Final Garbage Collection Flush
    del pdf_bytes
    del pages_data
    gc.collect()
    
    return {
        "status": "COMPLIANCE_AUDIT_COMPLETE",
        "meta": {"total_scanned": total_clauses_estimation, "high_risk_found": high_risk_count},
        "clauses": sorted(results, key=lambda x: x["mathematical_score"], reverse=True)
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
    
    return SandboxResponse(
        score=score,
        detected_jargon=jargon
    )