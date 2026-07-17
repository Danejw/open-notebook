"""Validation and optional verification-model retry for drawing extractions."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from construction_os.drawing.types import DrawingItemDraft, PageClassification


def _meta_value(items: List[DrawingItemDraft], subtype: str) -> Optional[Any]:
    for item in items:
        if item.item_type == "metadata_field" and item.subtype == subtype:
            return (item.properties or {}).get("value")
    return None


def validate_page_extraction(
    *,
    classification: PageClassification,
    items: List[DrawingItemDraft],
    evidence: Dict[str, Any],
) -> Tuple[List[DrawingItemDraft], List[Dict[str, Any]]]:
    """Deterministic validation; returns updated items + warning records."""
    warnings: List[Dict[str, Any]] = []
    text = str(evidence.get("plain_text") or "")
    upper = text.upper()

    sheet = classification.sheet_number or _meta_value(items, "sheet_number")
    if sheet and str(sheet).upper() not in upper:
        warnings.append(
            {
                "code": "sheet_number_not_in_text",
                "message": f"Sheet {sheet} not found in embedded PDF text",
            }
        )
        for item in items:
            if item.subtype == "sheet_number":
                item.confidence_band = "needs_review"
                item.warnings.append("sheet_number_not_in_text")

    scale = _meta_value(items, "scale")
    if scale:
        scale_ok = bool(
            re.search(r'\d+\s*/\s*\d+', str(scale))
            or str(scale).upper() == "AS NOTED"
        )
        if not scale_ok:
            warnings.append(
                {
                    "code": "invalid_scale",
                    "message": f"Scale '{scale}' failed syntax check",
                }
            )

    # Room consistency: name/number/area present
    for item in items:
        if item.item_type != "room":
            continue
        props = item.properties or {}
        if not props.get("room_name") or props.get("stated_area_sf") is None:
            item.confidence_band = "needs_review"
            item.warnings.append("incomplete_room_fields")
            warnings.append(
                {
                    "code": "incomplete_room",
                    "item": item.stable_id,
                    "message": "Room missing name or area",
                }
            )

    # Finish tags should appear in text (they came from text, so usually ok)
    for item in items:
        if item.item_type != "finish":
            continue
        tag = str((item.properties or {}).get("tag") or "")
        if tag and tag not in upper:
            item.confidence_band = "needs_review"
            warnings.append({"code": "finish_tag_missing", "tag": tag})

    # Cross-sheet refs mentioned
    for item in items:
        if item.subtype != "sheet_reference":
            continue
        ref = str((item.properties or {}).get("referenced_sheet") or "")
        if ref and ref not in upper:
            item.confidence_band = "needs_review"

    # Compare model-extracted text with PDF text for metadata fields
    for item in items:
        if item.item_type != "metadata_field":
            continue
        raw = (item.raw_text or "").strip()
        if raw and raw.upper() not in upper and len(raw) > 3:
            # Allow normalized differences
            tokens = [t for t in re.split(r"\W+", raw.upper()) if len(t) > 2]
            if tokens and not any(t in upper for t in tokens):
                item.warnings.append("value_not_in_pdf_text")
                if item.confidence_band == "high_confidence":
                    item.confidence_band = "medium_confidence"

    return items, warnings


def items_needing_verification(items: List[DrawingItemDraft]) -> List[DrawingItemDraft]:
    return [
        i
        for i in items
        if i.confidence_band in {"needs_review", "conflicting"}
        or i.confidence < 0.65
    ]
