"""Unit tests for HTML-native PDF rendering."""

from construction_os.utils.html_pdf_export import render_html_pdf


def test_render_html_pdf_returns_pdf_bytes():
    html = "<html><body><h1>Bid</h1><span>Total</span></body></html>"
    data = render_html_pdf(html)
    assert data.startswith(b"%PDF")
