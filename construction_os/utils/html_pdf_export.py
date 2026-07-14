"""Render HTML-native bid documents as PDF via xhtml2pdf."""

from __future__ import annotations

from io import BytesIO

from xhtml2pdf import pisa


def render_html_pdf(html_body: str) -> bytes:
    """Convert document HTML into a PDF byte stream."""
    buffer = BytesIO()
    result = pisa.CreatePDF(html_body, dest=buffer, encoding="utf-8")
    if result.err:
        raise RuntimeError("Failed to render HTML document PDF")
    return buffer.getvalue()
