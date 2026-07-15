"""Render HTML-native bid documents as PDF via Chromium (exact visual match)."""

from __future__ import annotations

from loguru import logger
from playwright.sync_api import sync_playwright


def render_html_pdf(html_body: str) -> bytes:
    """Convert document HTML into a PDF using Chromium print.

    The HTML is passed through unchanged so branded templates (CSS variables,
    modern layout, print styles, backgrounds) match the on-screen preview.
    """
    source = html_body or ""
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                # "load" waits for document + linked resources; no CSS rewriting.
                page.set_content(source, wait_until="load")
                pdf_bytes = page.pdf(
                    print_background=True,
                    prefer_css_page_size=True,
                    margin={
                        "top": "0",
                        "right": "0",
                        "bottom": "0",
                        "left": "0",
                    },
                )
            finally:
                browser.close()
    except Exception as e:
        logger.error(f"Chromium PDF render failed: {e}")
        raise RuntimeError(
            "Failed to render HTML document PDF. "
            "Ensure Chromium is installed (`uv run playwright install chromium`)."
        ) from e

    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise RuntimeError("Failed to render HTML document PDF")
    return pdf_bytes
