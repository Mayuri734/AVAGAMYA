import re
import spacy
import pdfplumber
import io
from typing import Optional, List, Dict, Any, Tuple, Set

# Load spaCy NLP models
nlp = spacy.load("en_core_web_sm")

# ---------------------------------------------------------------------------
# Jargon Categories Database
# ---------------------------------------------------------------------------
JARGON_DATABASE = {
    # English Jargon
    "Penalties & Fees": [
        "penalty",
        "forfeit",
        "forfeiture",
        "levy",
        "late fee",
        "over-limit",
        "surcharge",
    ],
    "Exclusion & Liability": [
        "not liable",
        "no liability",
        "unlimited liability",
        "exclusive remedy",
        "indemnify",
        "indemnification",
        "hold harmless",
        "disclaimer",
    ],
    "Unilateral Rights": [
        "sole discretion",
        "absolute discretion",
        "at its discretion",
        "reserve the right",
        "may refuse",
        "without notice",
        "revoke",
        "nullify",
    ],
    "Legal & Dispute": [
        "arbitration",
        "jurisdiction",
        "governing law",
        "breach",
        "default",
        "binding",
        "waiver",
    ],
    # Marathi Risk Factors (Translated)
    "Marathi Risk": [
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
    ],
    # Hindi Risk Factors (Translated)
    "Hindi Risk": [
        "उत्तरदायी",
        "जुर्माना",
        "हर्जाना",
        "रद्द",
        "अस्वीकृत",
        "शर्तें",
        "प्रतिबंध",
        "बकाया",
        "अनिवार्य",
    ],
}

FORBIDDEN_JARGON_LIST = [
    term for category in JARGON_DATABASE.values() for term in category
]

# ---------------------------------------------------------------------------
# Extraction & Cleaning logic (Zero Gemini)
# ---------------------------------------------------------------------------

LATTICE_TABLE_SETTINGS: Dict[str, Any] = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "intersection_tolerance": 5,
}

STREAM_TABLE_SETTINGS: Dict[str, Any] = {
    "vertical_strategy": "text",
    "horizontal_strategy": "text",
}


def _normalize_cell(cell: Optional[str]) -> str:
    if cell is None:
        return ""
    return " ".join(str(cell).split())


    return sentences


def _get_lattice_table_sentences(page: pdfplumber.page.Page) -> List[str]:
    """Extract sentences from lattice-type tables on a page."""
    sentences: List[str] = []
    try:
        tables = page.find_tables(table_settings=LATTICE_TABLE_SETTINGS)
        for table in tables:
            raw = table.extract()
            if raw:
                sentences.extend(_contextual_row_sentences(raw))
    except Exception:
        pass
    return sentences


def _get_stream_table_sentences(page: pdfplumber.page.Page) -> List[str]:
    """Extract sentences from stream-type tables as a fallback."""
    sentences: List[str] = []
    try:
        stream_tables = page.extract_tables(table_settings=STREAM_TABLE_SETTINGS)
        if stream_tables:
            for raw in stream_tables:
                if raw:
                    sentences.extend(_contextual_row_sentences(raw))
    except Exception:
        pass
    return sentences


def _table_rows_to_full_sentences(raw_rows: List[List[Optional[str]]]) -> List[str]:
    return _contextual_row_sentences(raw_rows)


def extract_text_with_layout(pdf_bytes: bytes) -> str:
    """
    Use pdfplumber to extract text while roughly preserving layout.
    """
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        texts = []
        for page in pdf.pages:
            text = page.extract_text() or ""
            texts.append(text)
        return "\n\n".join(texts).strip()


def advanced_clean(text: str) -> str:
    if not text or not text.strip():
        return ""
    cleaned_lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        digit_currency_chars = sum(1 for c in line if c.isdigit() or c in "₹%,.-")
        if len(line) > 0 and digit_currency_chars / len(line) > 0.30:
            continue
        if re.search(
            r"\b(page|pages?)\s+\d+|\bwww\.|\.com\b|toll\s*free|helpline|contact\s*us",
            line,
            re.IGNORECASE,
        ):
            continue
        if line.isupper() and len(line.split()) < 10:
            continue
        if re.search(r"₹\s*[A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9]+)+", line) or re.search(
            r"(?:[_.X]{2,}\s*)+", line
        ):
            continue
        cleaned_lines.append(line)

    return "\n".join(cleaned_lines)


def semantic_validator(clause: str) -> bool:
    if not clause or not clause.strip():
        return False
    try:
        doc = nlp(clause)
        has_verb, has_subject = False, False
        for token in doc:
            if token.pos_ == "VERB":
                has_verb = True
            if token.dep_ in ("nsubj", "nsubjpass"):
                has_subject = True
        return has_verb and has_subject
    except Exception:
        return False


def merge_with_previous(current: str, previous: str) -> Optional[str]:
    merged = f"{previous} {current}"
    return merged if semantic_validator(merged) else None


def semantic_segment_and_validate(text: str) -> List[str]:
    chunks = re.split(r"(?<=[.!?])\s+", text)
    valid_clauses = []
    buffer = ""

    for chunk in chunks:
        current = chunk.strip()
        if not current:
            continue

        if semantic_validator(current):
            if buffer:
                valid_clauses.append(buffer.strip())
                buffer = ""
            valid_clauses.append(current)
        else:
            if valid_clauses:
                merged = merge_with_previous(current, valid_clauses[-1])
                if merged:
                    valid_clauses[-1] = merged
                    buffer = ""
                    continue
            buffer = f"{buffer} {current}" if buffer else current

            if len(buffer.split()) > 15:
                buffer = ""

    if buffer:
        if semantic_validator(buffer.strip()) and len(buffer.split()) >= 5:
            valid_clauses.append(buffer.strip())

    return valid_clauses


def extract_text_page_aware(pdf_bytes: bytes) -> List[Tuple[int, str]]:
    """Extract text from PDF pages with awareness of tables and layout."""
    pages_data: List[Tuple[int, str]] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            # 1) Lattice priority
            table_sentences = _get_lattice_table_sentences(page)

            # 2) Fallback stream
            if not table_sentences:
                table_sentences = _get_stream_table_sentences(page)

            body = page.extract_text() or ""
            page_parts: List[str] = []
            if body.strip():
                page_parts.append(body.strip())
            if table_sentences:
                page_parts.append("\n".join(table_sentences))

            page_text = "\n\n".join(page_parts) if page_parts else ""
            pages_data.append((page_num, page_text))
    return pages_data


def _heal_line_sequence(lines: List[str], valid_endings: Set[str]) -> List[str]:
    merged: List[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        while i < len(lines) - 1:
            current = lines[i].rstrip()
            if current.endswith("-"):
                line = current[:-1] + lines[i + 1].strip()
                i += 1
                continue
            if current and current[-1] not in valid_endings:
                line = current + " " + lines[i + 1].strip()
                i += 1
                continue
            break
        if line.strip():
            merged.append(line.strip())
        i += 1
    return merged


def reconstruct_text_healer(pdf_bytes: bytes) -> List[Tuple[int, str]]:
    VALID_ENDINGS = {".", "?", "!", ":", ")", "]", '"', "'", "।"}
    pages_data = extract_text_page_aware(pdf_bytes)
    healed: List[Tuple[int, str]] = []

    for page_num, page_text in pages_data:
        if not page_text.strip():
            healed.append((page_num, page_text))
            continue

        lines = page_text.split("\n")
        merged_lines = _heal_line_sequence(lines, VALID_ENDINGS)

        reconstructed_text = "\n".join(merged_lines)
        cleaned_text = advanced_clean(reconstructed_text)

        if cleaned_text:
            healed.append((page_num, cleaned_text))

    return healed


# ---------------------------------------------------------------------------
# Sandbox Engine
# ---------------------------------------------------------------------------


class MathematicalRiskEngine:
    @staticmethod
    def segment_clauses(text: str) -> List[str]:
        return semantic_segment_and_validate(text)

    @staticmethod
    def calculate_risk_score(text: str) -> Tuple[float, List[str]]:
        """
        Purely mathematical formulation defined by requirements:
        Risk = (Jargon Hits * 15) + (Words / 5)
        Applies a Regional Penalty (+10) to Indic scripts containing Jargon.
        """
        words = text.split()
        word_count = len([w for w in words if w.strip()])

        lower_text = text.lower()
        detected_jargon = []
        for term in FORBIDDEN_JARGON_LIST:
            if term.lower() in lower_text and term.lower() not in detected_jargon:
                detected_jargon.append(term.lower())

        base_score = (len(detected_jargon) * 15) + (word_count / 5.0)

        # Determine language properties
        is_regional = bool(re.search(r"[\u0900-\u097F]", text))

        if is_regional and len(detected_jargon) > 0:
            base_score += 10.0  # Regional markup penalty

        final_score = min(round(base_score, 2), 100.0)
        return final_score, detected_jargon
