"""Tests for Chromium-based HTML → PDF export (exact template fidelity)."""

from unittest.mock import MagicMock, patch

import pytest

from construction_os.utils.html_pdf_export import render_html_pdf


def test_render_html_pdf_passes_html_unchanged_to_chromium():
    """HTML must not be sanitized or rewritten before Chromium print."""
    html = """<!DOCTYPE html><html><head><style>
      :root { --line: #cccccc; }
      body { color: #111; border-top: 1px solid var(--line); background: #fafafa; }
    </style></head><body><p>Bid Total</p></body></html>"""
    fake_pdf = b"%PDF-1.4 fake"

    mock_page = MagicMock()
    mock_page.pdf.return_value = fake_pdf
    mock_browser = MagicMock()
    mock_browser.new_page.return_value = mock_page
    mock_pw = MagicMock()
    mock_pw.chromium.launch.return_value = mock_browser
    mock_pw.__enter__.return_value = mock_pw
    mock_pw.__exit__.return_value = None

    with patch(
        "construction_os.utils.html_pdf_export.sync_playwright",
        return_value=mock_pw,
    ):
        pdf = render_html_pdf(html)

    assert pdf == fake_pdf
    mock_page.set_content.assert_called_once_with(html, wait_until="load")
    mock_page.pdf.assert_called_once_with(
        print_background=True,
        prefer_css_page_size=True,
        margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
    )
    mock_browser.close.assert_called_once()


def test_render_html_pdf_raises_on_browser_failure():
    with patch(
        "construction_os.utils.html_pdf_export.sync_playwright",
        side_effect=RuntimeError("browser missing"),
    ):
        with pytest.raises(RuntimeError, match="Failed to render HTML document PDF"):
            render_html_pdf("<html><body>x</body></html>")


def test_render_html_pdf_chromium_smoke():
    """Live Chromium smoke test (skips if browser is not installed)."""
    html = """<!DOCTYPE html><html><head><style>
      :root { --line: #cccccc; }
      body { color: #111; border-top: 1px solid var(--line); }
    </style></head><body><p>Bid Total</p></body></html>"""
    try:
        pdf = render_html_pdf(html)
    except RuntimeError as e:
        if "playwright install" in str(e).lower() or "chromium" in str(e).lower():
            pytest.skip(f"Chromium unavailable: {e}")
        raise
    assert pdf.startswith(b"%PDF")
