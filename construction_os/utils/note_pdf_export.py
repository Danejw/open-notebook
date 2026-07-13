"""Render project artifact notes as formatted PDF documents."""

from __future__ import annotations

import html
import re
from datetime import datetime
from io import BytesIO

import markdown
from xhtml2pdf import pisa

_PDF_CSS = """
@page {
    size: a4;
    margin: 2cm;
}

body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #1a1a1a;
}

.header {
    border-bottom: 1px solid #d4d4d4;
    margin-bottom: 18pt;
    padding-bottom: 8pt;
}

.header h1 {
    font-size: 20pt;
    font-weight: bold;
    margin: 0 0 4pt 0;
}

.header .meta {
    font-size: 9pt;
    color: #666666;
    margin: 0;
}

.content h1,
.content h2,
.content h3,
.content h4,
.content h5,
.content h6 {
    margin-top: 14pt;
    margin-bottom: 6pt;
}

.content h1 { font-size: 16pt; }
.content h2 { font-size: 14pt; }
.content h3 { font-size: 12pt; }
.content h4 { font-size: 11pt; }

.content p {
    margin: 0 0 8pt 0;
}

.content ul,
.content ol {
    margin: 0 0 8pt 16pt;
    padding: 0;
}

.content li {
    margin-bottom: 3pt;
}

.content blockquote {
    border-left: 3px solid #d4d4d4;
    color: #444444;
    margin: 0 0 8pt 0;
    padding: 2pt 0 2pt 10pt;
}

.content pre {
    background: #f4f4f5;
    border: 1px solid #e4e4e7;
    font-family: Courier, monospace;
    font-size: 9pt;
    line-height: 1.45;
    margin: 0 0 8pt 0;
    padding: 6pt 8pt;
    white-space: pre-wrap;
}

.content code {
    background: #f4f4f5;
    font-family: Courier, monospace;
    font-size: 9pt;
    padding: 1pt 2pt;
}

.content pre code {
    background: transparent;
    padding: 0;
}

.content table {
    border-collapse: collapse;
    margin: 0 0 8pt 0;
    width: 100%;
}

.content th,
.content td {
    border: 1px solid #d4d4d4;
    padding: 4pt 6pt;
    text-align: left;
    vertical-align: top;
}

.content th {
    background: #f4f4f5;
    font-weight: bold;
}

.content hr {
    border: none;
    border-top: 1px solid #d4d4d4;
    margin: 10pt 0;
}

.footer {
    color: #888888;
    font-size: 8pt;
    margin-top: 18pt;
    text-align: center;
}
"""

_MARKDOWN_EXTENSIONS = [
    "markdown.extensions.tables",
    "markdown.extensions.fenced_code",
    "markdown.extensions.sane_lists",
    "pymdownx.extra",
    "pymdownx.tasklist",
]


def sanitize_export_filename(title: str) -> str:
    """Build a filesystem-safe basename from a note title."""
    slug = re.sub(r"[^\w\s-]", "", title.lower())
    slug = re.sub(r"[\s_]+", "-", slug).strip("-")
    return slug[:80] if slug else "artifact"


def export_pdf_filename(title: str | None) -> str:
    """Return the attachment filename for a PDF export."""
    return f"{sanitize_export_filename(title or 'artifact')}.pdf"


def _format_updated_label(updated: str | None) -> str | None:
    if not updated:
        return None
    try:
        normalized = updated.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed.strftime("%B %d, %Y")
    except ValueError:
        return updated


def _markdown_to_html(content: str) -> str:
    return markdown.markdown(content or "", extensions=_MARKDOWN_EXTENSIONS)


def _build_pdf_html(title: str, content_html: str, updated: str | None) -> str:
    safe_title = html.escape(title or "Artifact")
    updated_label = _format_updated_label(updated)
    meta_html = (
        f'<p class="meta">Last updated: {html.escape(updated_label)}</p>'
        if updated_label
        else ""
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>{safe_title}</title>
    <style>{_PDF_CSS}</style>
</head>
<body>
    <div class="header">
        <h1>{safe_title}</h1>
        {meta_html}
    </div>
    <div class="content">
        {content_html}
    </div>
    <div class="footer">Exported from Construction OS</div>
</body>
</html>"""


def render_note_pdf(title: str, content: str, updated: str | None = None) -> bytes:
    """Convert artifact markdown content into a formatted PDF byte stream."""
    content_html = _markdown_to_html(content)
    document_html = _build_pdf_html(title, content_html, updated)
    buffer = BytesIO()
    result = pisa.CreatePDF(document_html, dest=buffer, encoding="utf-8")
    if result.err:
        raise RuntimeError("Failed to render artifact PDF")
    return buffer.getvalue()
