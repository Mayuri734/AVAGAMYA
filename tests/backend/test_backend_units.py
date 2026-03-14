import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock, patch
from main import analyze_upload
import asyncio


@pytest.mark.asyncio
async def test_empty_pdf_rejection():
    # Mock UploadFile
    mock_file = MagicMock()
    mock_file.filename = "empty.pdf"
    mock_file.content_type = "application/pdf"
    # Return empty bytes or very small bytes that result in no text
    mock_file.read = MagicMock(return_value=asyncio.Future())
    mock_file.read.return_value.set_result(b"%PDF-1.4\n%%EOF")

    # Mock background tasks
    mock_bg_tasks = MagicMock()

    # Mock extract_text_with_layout to return empty string
    with patch("main.extract_text_with_layout", return_value="   "), patch(
        "main.reconstruct_text_healer", return_value=[]
    ):
        with pytest.raises(HTTPException) as exc_info:
            await analyze_upload(
                background_tasks=mock_bg_tasks, language="en", file=mock_file
            )

        assert exc_info.value.status_code == 400
        assert "Empty PDF not allowed" in exc_info.value.detail
