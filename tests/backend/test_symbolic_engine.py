from main import SymbolicAnalysisEngine


def test_segment_clauses_basic():
    text = "This is a long sentence that should be kept as a clause. Another long sentence here too."
    clauses = SymbolicAnalysisEngine.segment_clauses(text)
    assert len(clauses) >= 2
    assert "This is a long sentence" in clauses[0]


def test_segment_clauses_noise_filtering():
    text = (
        "Short text. Page 1. https://example.com. Charge is 5%. Normal text here too."
    )
    clauses = SymbolicAnalysisEngine.segment_clauses(text)
    # "Short text." is < 7 words and no financial marker -> skipped
    # "Page 1." -> skipped (nav regex)
    # "https://example.com" -> skipped (nav regex)
    # "Charge is 5%." -> kept (financial marker %)
    # "Normal text here too." -> kept if words >= 7 (wait, "Normal text here too." is 4 words)

    # Let's verify the logic:
    # words < 7 and not has_financial_marker -> skip
    assert "Charge is 5%" in clauses[0]
    assert "Short text" not in clauses
    assert "Page 1" not in clauses


def test_detect_jargon():
    text = "The borrower will pay a late fee and penalty."
    jargon = SymbolicAnalysisEngine.detect_jargon(text)
    assert "late fee" in jargon
    assert "penalty" in jargon


def test_detect_financial_metrics():
    assert SymbolicAnalysisEngine.detect_financial_metrics("The fee is ₹500.") == "₹500"
    assert (
        SymbolicAnalysisEngine.detect_financial_metrics("Interest rate is 12.5%.")
        == "12.5%"
    )
    assert SymbolicAnalysisEngine.detect_financial_metrics("No metrics here.") is None


def test_confusion_index_english():
    # Simple textStat test
    text = "The cat sat on the mat."  # Easy
    score = SymbolicAnalysisEngine.calculate_confusion_index(text)
    assert score < 40.0

    complex_text = (
        "The implementation of multi-lateral fiscal policies requires "
        "comprehensive oversight of decentralized institutional frameworks."
    )  # Hard
    score_hard = SymbolicAnalysisEngine.calculate_confusion_index(complex_text)
    assert score_hard > 60.0


def test_confusion_index_indic_bypass():
    text = "बँक खाते उघडण्यासाठी आधार कार्ड आवश्यक आहे."  # Marathi
    score = SymbolicAnalysisEngine.calculate_confusion_index(text)
    assert score == 85.0  # Fixed bypass value


def test_classify_risk():
    assert SymbolicAnalysisEngine.classify_risk(20.0) == "LOW"
    assert SymbolicAnalysisEngine.classify_risk(50.0) == "MEDIUM"
    assert SymbolicAnalysisEngine.classify_risk(85.0) == "HIGH"


def test_indic_numeral_translation_in_regex():
    # SymbolicAnalysisEngine uses patterns that should handle Indic numerals if updated
    # Currently RATE_PATTERN = re.compile(r"([\d\u0966-\u096F]+(?:\.[\d\u0966-\u096F]+)?)\s*%")
    # \u0966-\u096F are Devanagari numerals ०-९
    text = "व्याज दर १०.५% आहे."  # 10.5%
    match = SymbolicAnalysisEngine.RATE_PATTERN.search(text)
    assert match is not None
    assert match.group(1) == "१०.५"
