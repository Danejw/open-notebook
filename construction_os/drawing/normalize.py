"""Normalization, deduplication, and confidence banding."""

from __future__ import annotations

import re
from typing import Dict, List, Tuple

from construction_os.drawing.types import DrawingItemDraft, DrawingRelationshipDraft


def _norm_sheet(value: str) -> str:
    return re.sub(r"\s+", "", value.strip().upper())


def _norm_room(value: str) -> str:
    return re.sub(r"\D", "", value.strip())


def normalize_item(item: DrawingItemDraft) -> DrawingItemDraft:
    props = dict(item.properties or {})
    if item.item_type == "metadata_field" and item.subtype == "sheet_number" and item.label:
        if props.get("value"):
            props["value"] = _norm_sheet(str(props["value"]))
    if item.item_type == "room":
        if props.get("room_number"):
            props["room_number"] = _norm_room(str(props["room_number"]))
        if props.get("room_name"):
            props["room_name"] = re.sub(r"\s+", " ", str(props["room_name"])).strip()
    if item.item_type == "finish" and props.get("tag"):
        props["tag"] = str(props["tag"]).upper().strip()
    if item.item_type == "callout" and props.get("referenced_sheet"):
        props["referenced_sheet"] = _norm_sheet(str(props["referenced_sheet"]))
    if item.item_type == "dimension" and item.raw_text:
        props["normalized"] = re.sub(r"\s+", "", item.raw_text)
    item.properties = props
    return item


def assign_confidence_band(item: DrawingItemDraft) -> DrawingItemDraft:
    if item.confidence_band in {
        "verified",
        "conflicting",
        "unsupported",
        "needs_review",
    }:
        return item
    c = item.confidence
    if c >= 0.9:
        item.confidence_band = "high_confidence"
    elif c >= 0.65:
        item.confidence_band = "medium_confidence"
    else:
        item.confidence_band = "needs_review"
    return item


def deduplicate_items(
    items: List[DrawingItemDraft],
) -> Tuple[List[DrawingItemDraft], List[Dict]]:
    """Deduplicate by type+normalized id+overlap; preserve conflicts."""
    kept: List[DrawingItemDraft] = []
    conflicts: List[Dict] = []
    index: Dict[str, DrawingItemDraft] = {}

    for item in items:
        item = normalize_item(item)
        item = assign_confidence_band(item)
        key_parts = [item.item_type, item.subtype or "", item.stable_id]
        if item.item_type == "finish":
            key_parts = ["finish", str((item.properties or {}).get("tag") or item.label)]
        key = "|".join(key_parts).lower()

        existing = index.get(key)
        if existing is None:
            index[key] = item
            kept.append(item)
            continue

        # Same key — check for conflict vs duplicate
        same_text = (existing.raw_text or "").strip() == (item.raw_text or "").strip()
        bbox_overlap = False
        if existing.bbox_norm and item.bbox_norm:
            bbox_overlap = existing.bbox_norm.iou(item.bbox_norm) >= 0.5

        if same_text or bbox_overlap:
            # Keep higher confidence
            if item.confidence > existing.confidence:
                kept = [i for i in kept if i.stable_id != existing.stable_id]
                kept.append(item)
                index[key] = item
            continue

        conflicts.append(
            {
                "type": "value_conflict",
                "key": key,
                "a": existing.stable_id,
                "b": item.stable_id,
                "a_text": existing.raw_text,
                "b_text": item.raw_text,
            }
        )
        item.confidence_band = "conflicting"
        item.warnings = list(item.warnings or []) + ["conflict_with:" + existing.stable_id]
        existing.warnings = list(existing.warnings or []) + ["conflict_with:" + item.stable_id]
        existing.confidence_band = "conflicting"
        kept.append(item)
        # Don't overwrite index — both remain

    return kept, conflicts


def normalize_and_dedupe(
    items: List[DrawingItemDraft],
    relationships: List[DrawingRelationshipDraft],
) -> Tuple[List[DrawingItemDraft], List[DrawingRelationshipDraft], List[Dict]]:
    items_out, conflicts = deduplicate_items(items)
    # Deduplicate relationships by type+from+to
    seen = set()
    rels_out: List[DrawingRelationshipDraft] = []
    for rel in relationships:
        key = (
            rel.relationship_type,
            rel.from_item_id or rel.from_label or "",
            rel.to_item_id or rel.to_label or "",
        )
        if key in seen:
            continue
        seen.add(key)
        rels_out.append(rel)
    return items_out, rels_out, conflicts
