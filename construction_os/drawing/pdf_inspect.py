"""Deterministic PDF page inspection via PyMuPDF."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import fitz
from loguru import logger

from construction_os.drawing.types import BBox, pdf_to_norm


def compute_file_hash(file_path: str | Path, *, chunk_size: int = 1024 * 1024) -> str:
    """SHA-256 content hash for skip/rerun decisions."""
    digest = hashlib.sha256()
    with open(file_path, "rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _rect_to_bbox(rect: fitz.Rect) -> BBox:
    return BBox(x0=float(rect.x0), y0=float(rect.y0), x1=float(rect.x1), y1=float(rect.y1))


def _classify_page_kind(
    *,
    word_count: int,
    image_count: int,
    path_count: int,
    text_coverage: float,
) -> str:
    """Heuristic: born-digital vs scanned vs hybrid."""
    if word_count >= 40 and path_count >= 20:
        return "born_digital"
    if word_count < 15 and image_count >= 1:
        return "scanned"
    if word_count >= 15 and image_count >= 1 and text_coverage < 0.15:
        return "hybrid"
    if word_count >= 20:
        return "born_digital"
    if image_count >= 1:
        return "scanned"
    return "unknown"


def inspect_page(page: fitz.Page, page_index: int) -> Dict[str, Any]:
    """Collect deterministic page evidence without discarding coordinates."""
    rect = page.rect
    width = float(rect.width)
    height = float(rect.height)
    rotation = int(page.rotation or 0)
    page_label = page.get_label() or str(page_index + 1)

    words_raw = page.get_text("words") or []
    words: List[Dict[str, Any]] = []
    for w in words_raw:
        # x0, y0, x1, y1, word, block, line, word_no
        bbox_pdf = BBox(x0=float(w[0]), y0=float(w[1]), x1=float(w[2]), y1=float(w[3]))
        words.append(
            {
                "text": str(w[4]),
                "bbox_pdf": bbox_pdf.model_dump(),
                "bbox_norm": pdf_to_norm(bbox_pdf, width, height).model_dump(),
                "block": int(w[5]) if len(w) > 5 else None,
                "line": int(w[6]) if len(w) > 6 else None,
                "word_no": int(w[7]) if len(w) > 7 else None,
            }
        )

    blocks_raw = page.get_text("blocks") or []
    blocks: List[Dict[str, Any]] = []
    text_area = 0.0
    for block in blocks_raw:
        if len(block) < 5:
            continue
        # image blocks have type 1
        block_type = int(block[6]) if len(block) > 6 else 0
        if block_type == 1:
            continue
        bbox_pdf = BBox(
            x0=float(block[0]),
            y0=float(block[1]),
            x1=float(block[2]),
            y1=float(block[3]),
        )
        text = str(block[4]) if len(block) > 4 else ""
        text_area += bbox_pdf.area()
        blocks.append(
            {
                "text": text,
                "bbox_pdf": bbox_pdf.model_dump(),
                "bbox_norm": pdf_to_norm(bbox_pdf, width, height).model_dump(),
            }
        )

    images: List[Dict[str, Any]] = []
    for img in page.get_images(full=True) or []:
        xref = img[0]
        try:
            rects = page.get_image_rects(xref) or []
        except Exception:
            rects = []
        for r in rects:
            bbox_pdf = _rect_to_bbox(r)
            images.append(
                {
                    "xref": int(xref),
                    "bbox_pdf": bbox_pdf.model_dump(),
                    "bbox_norm": pdf_to_norm(bbox_pdf, width, height).model_dump(),
                }
            )

    paths: List[Dict[str, Any]] = []
    try:
        drawings = page.get_drawings() or []
    except Exception as exc:
        logger.debug("get_drawings failed on page {}: {}", page_index, exc)
        drawings = []
    for d in drawings[:5000]:  # cap for very dense sheets
        r = d.get("rect")
        if r is None:
            continue
        bbox_pdf = _rect_to_bbox(r)
        paths.append(
            {
                "type": str(d.get("type") or "path"),
                "bbox_pdf": bbox_pdf.model_dump(),
                "bbox_norm": pdf_to_norm(bbox_pdf, width, height).model_dump(),
            }
        )

    page_area = max(width * height, 1.0)
    text_coverage = min(1.0, text_area / page_area)
    page_kind = _classify_page_kind(
        word_count=len(words),
        image_count=len(images),
        path_count=len(paths),
        text_coverage=text_coverage,
    )

    plain_text = page.get_text("text") or ""

    return {
        "page_index": page_index,
        "page_label": page_label,
        "width": width,
        "height": height,
        "rotation": rotation,
        "words": words,
        "blocks": blocks,
        "images": images,
        "paths": paths,
        "path_count": len(paths),
        "word_count": len(words),
        "image_count": len(images),
        "text_coverage": text_coverage,
        "page_kind": page_kind,
        "plain_text": plain_text,
        "metadata": dict(page.metadata or {}) if hasattr(page, "metadata") else {},
    }


def inspect_pdf(file_path: str | Path) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Inspect every page of a PDF. Returns (pages, document_meta)."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Not a PDF file: {path}")

    doc = fitz.open(path)
    try:
        pages = [inspect_page(doc[i], i) for i in range(len(doc))]
        meta = {
            "page_count": len(doc),
            "metadata": dict(doc.metadata or {}),
            "is_pdf": bool(doc.is_pdf),
            "needs_pass": bool(doc.needs_pass),
        }
        return pages, meta
    finally:
        doc.close()


def open_pdf(file_path: str | Path) -> fitz.Document:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")
    return fitz.open(path)


def resolve_source_pdf_path(file_path: Optional[str]) -> Path:
    """Validate that an original uploaded PDF exists and is readable."""
    if not file_path or not str(file_path).strip():
        raise ValueError("Source has no original file_path")
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Original PDF missing: {path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Source file is not a PDF: {path}")
    return path
