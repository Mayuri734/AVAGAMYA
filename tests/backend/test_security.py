import pytest
from httpx import AsyncClient, ASGITransport
from main import app
from unittest.mock import patch


@pytest.mark.asyncio
async def test_pii_gate_blocking():
    """
    Test Case 1: Upload a document containing mock 16-digit Credit Card strings.
    Assertion: The system must return a BLOCKED status and a 'Security Alert' message.
    """
    # Mocking the PDF extraction to return text with a Credit Card number
    with patch("main.extract_text_with_layout") as mock_extract, patch(
        "main.reconstruct_text_healer"
    ) as mock_healer:

        mock_extract.return_value = (
            "This is a document with a credit card: 4111-1111-1111-1111. High risk!"
        )
        mock_healer.return_value = []  # Not used if blocked

        dummy_pdf = (
            b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        )
        files = {"file": ("credit_card.pdf", dummy_pdf, "application/pdf")}

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            response = await ac.post("/analyze/upload?language=en", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "BLOCKED"
        assert data["pii_result"] == "BLOCKED"
        assert "Security Alert" in data["message"]


@pytest.mark.asyncio
async def test_pan_card_blocking():
    """
    Test Case 2: Upload a document containing mock Indian PAN Card numbers.
    Assertion: The system must return a BLOCKED status.
    """
    with patch("main.extract_text_with_layout") as mock_extract:
        # Indian PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)
        mock_extract.return_value = "Sensitive Info: My PAN is ABCDE1234F."

        dummy_pdf = (
            b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        )
        files = {"file": ("pan_card.pdf", dummy_pdf, "application/pdf")}

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            response = await ac.post("/analyze/upload?language=hi", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "BLOCKED"
        assert data["pii_result"] == "BLOCKED"


@pytest.mark.asyncio
async def test_pii_compliance_logging():
    """
    Test Case 3: Verify that the blocked event is logged to compliance_logs.
    """
    with patch("main.extract_text_with_layout") as mock_extract, patch(
        "main.log_dpo_event"
    ) as mock_log:

        mock_extract.return_value = "Personal Info: 4222 2222 2222 2222"
        dummy_pdf = (
            b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        )
        files = {"file": ("blocked_log.pdf", dummy_pdf, "application/pdf")}

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            await ac.post("/analyze/upload?language=hi", files=files)

        # Verify background task was added and called (ASGITransport executes background tasks)
        assert mock_log.called
        # Check call arguments
        # args: (filename, status, details, processing_time, language_detected, unique_hash, risk_score)
        _, kwargs = mock_log.call_args
        assert kwargs["status"] == "BLOCKED"
        assert "PII Detected" in kwargs["details"]
        assert kwargs["filename"] == "blocked_log.pdf"
