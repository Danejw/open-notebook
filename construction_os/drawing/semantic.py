"""Build semantic drawing knowledge records for project-brain publishing."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from construction_os.drawing.types import DrawingItemDraft, PageClassification


def _val(items: List[DrawingItemDraft], subtype: str) -> Optional[Any]:
    for item in items:
        if item.item_type == "metadata_field" and item.subtype == subtype:
            return (item.properties or {}).get("value")
    return None


def build_semantic_records(
    *,
    classification: PageClassification,
    items: List[DrawingItemDraft],
    page_index: int,
    page_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Create retrieval-oriented semantic records (not arbitrary chunk dumps)."""
    records: List[Dict[str, Any]] = []
    sheet = classification.sheet_number or _val(items, "sheet_number")
    title = classification.sheet_title or _val(items, "sheet_title")
    scale = _val(items, "scale")
    project = _val(items, "project_name")
    address = _val(items, "project_address")
    discipline = classification.discipline
    drawing_type = (classification.drawing_types or ["unknown"])[0]

    rooms = [i for i in items if i.item_type == "room"]
    finishes = [i for i in items if i.item_type == "finish"]
    notes = [i for i in items if i.item_type == "note"]
    fixtures = [i for i in items if i.item_type == "fixture"]
    refs = [i for i in items if i.subtype == "sheet_reference"]
    dims = [i for i in items if i.item_type == "dimension"]

    finish_tags = sorted(
        {
            str((f.properties or {}).get("tag") or f.label)
            for f in finishes
            if f.label or (f.properties or {}).get("tag")
        }
    )
    ref_sheets = sorted(
        {
            str((r.properties or {}).get("referenced_sheet") or r.label)
            for r in refs
            if r.label
        }
    )

    sheet_lines = [
        f"Sheet {sheet or 'unknown'} — {title or 'Drawing'}",
        f"Discipline: {discipline}",
        f"Drawing type: {drawing_type}",
    ]
    if project:
        sheet_lines.append(f"Project: {project}")
    if address:
        sheet_lines.append(f"Address: {address}")
    if scale:
        sheet_lines.append(f"Scale: {scale}")
    sheet_lines.append(
        f"Contains {len(rooms)} rooms, {len(finish_tags)} finish tags, "
        f"{len(notes)} notes, {len(fixtures)} fixtures, "
        f"and cross-sheet references: {', '.join(ref_sheets) or 'none'}."
    )
    records.append(
        {
            "record_type": "sheet",
            "title": f"Sheet {sheet or page_index} — {title or 'Drawing'}",
            "content": "\n".join(sheet_lines),
            "discipline": discipline,
            "sheet_number": sheet,
            "drawing_type": drawing_type,
            "item_ids": [i.stable_id for i in items if i.item_type == "metadata_field"],
            "page_id": page_id,
            "confidence": classification.confidence,
            "confidence_band": "high_confidence"
            if classification.confidence >= 0.8
            else "medium_confidence",
            "verification_status": "unverified",
            "bbox_norm": None,
            "evidence_crop": None,
            "metadata": {"page_index": page_index},
        }
    )

    for room in rooms:
        props = room.properties or {}
        name = props.get("room_name") or room.label
        num = props.get("room_number")
        area = props.get("stated_area_sf")
        lines = [
            f"Room {num or ''} — {name}".strip(" —"),
            f"Stated area: {area} SF" if area is not None else None,
            f"Located on: {sheet} {title or ''}".strip(),
            f"Related finishes: {', '.join(finish_tags[:20])}" if finish_tags else None,
            f"Applicable notes: {len(notes)} notes on this sheet",
        ]
        records.append(
            {
                "record_type": "room",
                "title": f"Room {num} — {name}" if num else str(name),
                "content": "\n".join([ln for ln in lines if ln]),
                "discipline": discipline,
                "sheet_number": sheet,
                "drawing_type": drawing_type,
                "item_ids": [room.stable_id],
                "page_id": page_id,
                "confidence": room.confidence,
                "confidence_band": room.confidence_band,
                "verification_status": room.verification_status,
                "bbox_norm": room.bbox_norm.model_dump() if room.bbox_norm else None,
                "evidence_crop": room.evidence_crop,
                "metadata": {"page_index": page_index, **props},
            }
        )

    for note in notes:
        records.append(
            {
                "record_type": "note",
                "title": note.label or "Note",
                "content": (
                    f"{note.label or 'Note'} on {sheet or 'sheet'}\n"
                    f"{note.raw_text or ''}"
                ),
                "discipline": discipline,
                "sheet_number": sheet,
                "drawing_type": drawing_type,
                "item_ids": [note.stable_id],
                "page_id": page_id,
                "confidence": note.confidence,
                "confidence_band": note.confidence_band,
                "verification_status": note.verification_status,
                "bbox_norm": note.bbox_norm.model_dump() if note.bbox_norm else None,
                "evidence_crop": note.evidence_crop,
                "metadata": {"page_index": page_index, "subtype": note.subtype},
            }
        )

    if finish_tags:
        records.append(
            {
                "record_type": "finish",
                "title": f"Finish tags on {sheet or 'sheet'}",
                "content": (
                    f"Finish / material tags on sheet {sheet}: "
                    + ", ".join(finish_tags)
                ),
                "discipline": discipline,
                "sheet_number": sheet,
                "drawing_type": drawing_type,
                "item_ids": [f.stable_id for f in finishes],
                "page_id": page_id,
                "confidence": 0.85,
                "confidence_band": "high_confidence",
                "verification_status": "unverified",
                "bbox_norm": None,
                "evidence_crop": None,
                "metadata": {"tags": finish_tags, "page_index": page_index},
            }
        )

    for fixture in fixtures:
        records.append(
            {
                "record_type": "fixture",
                "title": fixture.label or "Fixture",
                "content": (
                    f"{fixture.label} ({fixture.subtype}) on sheet {sheet}. "
                    f"Raw: {fixture.raw_text or ''}"
                ),
                "discipline": discipline,
                "sheet_number": sheet,
                "drawing_type": drawing_type,
                "item_ids": [fixture.stable_id],
                "page_id": page_id,
                "confidence": fixture.confidence,
                "confidence_band": fixture.confidence_band,
                "verification_status": fixture.verification_status,
                "bbox_norm": fixture.bbox_norm.model_dump() if fixture.bbox_norm else None,
                "evidence_crop": fixture.evidence_crop,
                "metadata": {"page_index": page_index},
            }
        )

    for ref in refs:
        ref_sheet = (ref.properties or {}).get("referenced_sheet") or ref.label
        records.append(
            {
                "record_type": "cross_sheet_reference",
                "title": f"Reference to {ref_sheet}",
                "content": (
                    f"Sheet {sheet} references drawing sheet {ref_sheet}."
                ),
                "discipline": discipline,
                "sheet_number": sheet,
                "drawing_type": drawing_type,
                "item_ids": [ref.stable_id],
                "page_id": page_id,
                "confidence": ref.confidence,
                "confidence_band": ref.confidence_band,
                "verification_status": ref.verification_status,
                "bbox_norm": ref.bbox_norm.model_dump() if ref.bbox_norm else None,
                "evidence_crop": ref.evidence_crop,
                "metadata": {"page_index": page_index, "referenced_sheet": ref_sheet},
            }
        )

    # Major unclassified / dimensions summary (avoid flooding)
    if dims:
        sample = ", ".join((d.raw_text or "") for d in dims[:15])
        records.append(
            {
                "record_type": "dimension_summary",
                "title": f"Dimensions on {sheet or 'sheet'}",
                "content": f"Visible dimensions include: {sample}",
                "discipline": discipline,
                "sheet_number": sheet,
                "drawing_type": drawing_type,
                "item_ids": [d.stable_id for d in dims[:15]],
                "page_id": page_id,
                "confidence": 0.6,
                "confidence_band": "medium_confidence",
                "verification_status": "unverified",
                "bbox_norm": None,
                "evidence_crop": None,
                "metadata": {"page_index": page_index, "count": len(dims)},
            }
        )

    return records
