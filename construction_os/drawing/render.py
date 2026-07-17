"""Page rendering and adaptive crops for drawing extraction."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import fitz
from loguru import logger

from construction_os.drawing.types import BBox, pdf_to_norm


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def render_page_image(
    page: fitz.Page,
    output_path: Path,
    *,
    dpi: int = 200,
) -> Path:
    """Render a full page to PNG."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    pix.save(str(output_path))
    return output_path


def render_crop(
    page: fitz.Page,
    bbox_pdf: BBox,
    output_path: Path,
    *,
    dpi: int = 300,
    pad: float = 4.0,
) -> Path:
    """Render a region crop to PNG."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    clip = fitz.Rect(
        max(0, bbox_pdf.x0 - pad),
        max(0, bbox_pdf.y0 - pad),
        min(page.rect.width, bbox_pdf.x1 + pad),
        min(page.rect.height, bbox_pdf.y1 + pad),
    )
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, clip=clip, alpha=False)
    pix.save(str(output_path))
    return output_path


def generate_overlapping_grid_crops(
    page: fitz.Page,
    output_dir: Path,
    *,
    rows: int = 2,
    cols: int = 3,
    overlap: float = 0.15,
    dpi: int = 300,
) -> List[Dict[str, Any]]:
    """Generate overlapping high-res crops covering the page."""
    _ensure_dir(output_dir)
    width = float(page.rect.width)
    height = float(page.rect.height)
    cell_w = width / cols
    cell_h = height / rows
    ox = cell_w * overlap
    oy = cell_h * overlap

    crops: List[Dict[str, Any]] = []
    for r in range(rows):
        for c in range(cols):
            x0 = max(0.0, c * cell_w - (ox if c > 0 else 0.0))
            y0 = max(0.0, r * cell_h - (oy if r > 0 else 0.0))
            x1 = min(width, (c + 1) * cell_w + (ox if c < cols - 1 else 0.0))
            y1 = min(height, (r + 1) * cell_h + (oy if r < rows - 1 else 0.0))
            bbox = BBox(x0=x0, y0=y0, x1=x1, y1=y1)
            path = output_dir / f"grid_r{r}_c{c}.png"
            try:
                render_crop(page, bbox, path, dpi=dpi)
            except Exception as exc:
                logger.warning("Failed grid crop r{} c{}: {}", r, c, exc)
                continue
            crops.append(
                {
                    "kind": "grid",
                    "row": r,
                    "col": c,
                    "path": str(path),
                    "bbox_pdf": bbox.model_dump(),
                    "bbox_norm": pdf_to_norm(bbox, width, height).model_dump(),
                    "transform": {
                        "page_width": width,
                        "page_height": height,
                        "crop_x0": x0,
                        "crop_y0": y0,
                        "crop_x1": x1,
                        "crop_y1": y1,
                    },
                }
            )
    return crops


def render_page_assets(
    page: fitz.Page,
    page_dir: Path,
    *,
    page_dpi: int = 200,
    thumbnail_dpi: int = 72,
    dense_crop_dpi: int = 300,
    crop_overlap: float = 0.15,
    include_grid_crops: bool = True,
) -> Dict[str, Any]:
    """Render full page, thumbnail, and optional overlapping crops."""
    _ensure_dir(page_dir)
    render_path = page_dir / "page.png"
    thumb_path = page_dir / "thumb.png"
    render_page_image(page, render_path, dpi=page_dpi)
    render_page_image(page, thumb_path, dpi=thumbnail_dpi)

    crops: List[Dict[str, Any]] = []
    if include_grid_crops:
        crops = generate_overlapping_grid_crops(
            page,
            page_dir / "crops",
            overlap=crop_overlap,
            dpi=dense_crop_dpi,
        )

    return {
        "render_path": str(render_path),
        "thumbnail_path": str(thumb_path),
        "crops": crops,
    }


def crop_region_asset(
    page: fitz.Page,
    bbox_pdf: BBox,
    output_path: Path,
    *,
    dpi: int = 300,
) -> Optional[str]:
    try:
        render_crop(page, bbox_pdf, output_path, dpi=dpi)
        return str(output_path)
    except Exception as exc:
        logger.warning("Region crop failed {}: {}", output_path, exc)
        return None
