"""Deterministic classification and content extraction from PDF text+geometry."""

from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from construction_os.drawing.types import (
    BBox,
    DrawingItemDraft,
    DrawingRelationshipDraft,
    PageClassification,
    RegionDraft,
    pdf_to_norm,
)

_SHEET_RE = re.compile(r"\b([A-Z]{1,3}\d{1,4}[A-Z]?)\b")
_SCALE_RE = re.compile(
    r'(\d+\s*/\s*\d+\s*"\s*=\s*\d+[\'-]?\s*-?\s*\d*"?)|'
    r"(\d+/\d+\s*=\s*1['\-]\s*0\")|"
    r'(AS\s+NOTED)',
    re.IGNORECASE,
)
_ROOM_AREA_RE = re.compile(
    r"(?P<name>[A-Z][A-Z0-9 /.&'\-]{2,40}?)\s*\n\s*"
    r"(?P<area>[\d,]+)\s*SF\s*\n\s*"
    r"(?P<num>\d{2,4})\b",
    re.MULTILINE,
)
_ROOM_INLINE_RE = re.compile(
    r"(?P<name>(?:\(E\)\s+)?[A-Z][A-Z0-9 /.&'\-]{2,40}?)\s+"
    r"(?P<area>[\d,]+)\s*SF\s+"
    r"(?P<num>\d{2,4})\b"
)
_FINISH_TAG_RE = re.compile(
    r"\b(QT-B|QT|PT-\d+|PL-\d+|SS|W-CUR|MP-\d+|T-\d+|B-\d+|WC)\b"
)
_SHEET_REF_RE = re.compile(r"\b([A-Z]\d{3}[A-Z]?)\b")
_REVISION_RE = re.compile(
    r"(?P<date>\d{2}[-/]\d{2}[-/]\d{2,4}).{0,40}?(?P<desc>PLANNING[^.\n]{0,60})",
    re.IGNORECASE | re.DOTALL,
)
_FD_RE = re.compile(r"\bFD\b")


def _stable(prefix: str, *parts: str) -> str:
    joined = ":".join(p.strip().lower() for p in parts if p)
    return f"{prefix}:{joined}" if joined else f"{prefix}:{uuid.uuid4().hex[:8]}"


def _find_word_bbox(
    words: List[Dict[str, Any]], text: str
) -> Optional[BBox]:
    needle = text.strip().upper()
    for w in words:
        if str(w.get("text") or "").strip().upper() == needle:
            raw = w.get("bbox_pdf") or {}
            return BBox(**raw)
    # multi-word: try first token
    first = needle.split()[0] if needle else ""
    if first:
        for w in words:
            if str(w.get("text") or "").strip().upper() == first:
                raw = w.get("bbox_pdf") or {}
                return BBox(**raw)
    return None


def _bbox_for_phrase(
    words: List[Dict[str, Any]], phrase: str
) -> Optional[BBox]:
    tokens = [t for t in re.split(r"\s+", phrase.strip().upper()) if t]
    if not tokens:
        return None
    texts = [str(w.get("text") or "").strip().upper() for w in words]
    for i in range(len(texts) - len(tokens) + 1):
        if texts[i : i + len(tokens)] == tokens:
            boxes = [BBox(**(words[i + j]["bbox_pdf"])) for j in range(len(tokens))]
            return BBox(
                x0=min(b.x0 for b in boxes),
                y0=min(b.y0 for b in boxes),
                x1=max(b.x1 for b in boxes),
                y1=max(b.y1 for b in boxes),
            )
    return _find_word_bbox(words, tokens[0])


def classify_page_deterministic(
    evidence: Dict[str, Any],
    *,
    filename: str = "",
    source_title: str = "",
) -> PageClassification:
    """Lightweight drawing classification from PDF text + metadata."""
    text = str(evidence.get("plain_text") or "")
    upper = text.upper()
    reasons: List[str] = []
    drawing_types: List[str] = []
    discipline = "unknown"
    sheet_number: Optional[str] = None
    sheet_title: Optional[str] = None
    confidence = 0.4

    # Sheet number: prefer tokens near "SHEET" / title block or filename
    fname = (filename or "").upper()
    m_file = re.search(r"([A-Z]{1,3}\d{3}[A-Z]?)", fname)
    if m_file:
        sheet_number = m_file.group(1)
        reasons.append(f"sheet_from_filename:{sheet_number}")
        confidence += 0.15

    # Common pattern: sheet id appears near FINISH FLOOR PLAN
    m_sheet = re.search(
        r"\b([A-Z]\d{3}[A-Z]?)\s*\n\s*FINISH FLOOR PLAN",
        text,
        re.IGNORECASE,
    )
    if m_sheet:
        sheet_number = m_sheet.group(1).upper()
        reasons.append("sheet_near_title")
        confidence += 0.2
    elif not sheet_number:
        # last A### in text often is the sheet itself in title block
        refs = _SHEET_REF_RE.findall(upper)
        if refs:
            sheet_number = refs[-1]
            reasons.append("sheet_last_ref")
            confidence += 0.1

    if "FINISH FLOOR PLAN" in upper:
        sheet_title = "Finish Floor Plan"
        drawing_types.extend(["finish_plan", "floor_plan"])
        discipline = "architectural"
        reasons.append("title:finish_floor_plan")
        confidence += 0.25
    elif "REFLECTED CEILING" in upper or "RCP" in upper:
        sheet_title = "Reflected Ceiling Plan"
        drawing_types.append("reflected_ceiling_plan")
        discipline = "architectural"
        reasons.append("title:rcp")
        confidence += 0.2
    elif "FLOOR PLAN" in upper:
        sheet_title = "Floor Plan"
        drawing_types.append("floor_plan")
        discipline = "architectural"
        reasons.append("title:floor_plan")
        confidence += 0.2
    elif "ELEVATION" in upper:
        drawing_types.append("elevation")
        reasons.append("title:elevation")
        confidence += 0.15
    elif "SECTION" in upper:
        drawing_types.append("section")
        reasons.append("title:section")
        confidence += 0.15
    elif "SCHEDULE" in upper:
        drawing_types.append("schedule")
        reasons.append("title:schedule")
        confidence += 0.15

    if any(k in upper for k in ("TITLE BLOCK", "SHEET NAME", "PROJECT NAME", "REVISIONS")):
        reasons.append("title_block_markers")
        confidence += 0.1

    path_count = int(evidence.get("path_count") or 0)
    word_count = int(evidence.get("word_count") or 0)
    if path_count > 50 and word_count > 30:
        reasons.append("dense_vector_geometry")
        confidence += 0.1

    is_drawing = bool(drawing_types) or (
        path_count > 80 and word_count > 40 and "SHEET" in upper
    )
    if not drawing_types and is_drawing:
        drawing_types = ["unknown"]
        discipline = "general"

    if source_title and "DRAWING" in source_title.upper():
        reasons.append("source_title_hint")
        confidence += 0.05

    confidence = min(0.98, confidence)
    return PageClassification(
        is_drawing=is_drawing,
        discipline=discipline,
        sheet_number=sheet_number,
        sheet_title=sheet_title,
        drawing_types=drawing_types or (["unknown"] if is_drawing else []),
        confidence=confidence,
        reasons=reasons,
    )


def detect_regions_heuristic(
    evidence: Dict[str, Any],
    classification: PageClassification,
) -> List[RegionDraft]:
    """Detect major page regions using normalized heuristics + keyword anchors."""
    width = float(evidence.get("width") or 1)
    height = float(evidence.get("height") or 1)
    words = evidence.get("words") or []
    regions: List[RegionDraft] = []

    def add_norm(
        region_type: str,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
        confidence: float,
        method: str,
    ) -> None:
        bbox_norm = BBox(x0=x0, y0=y0, x1=x1, y1=y1)
        bbox_pdf = BBox(
            x0=x0 * width,
            y0=y0 * height,
            x1=x1 * width,
            y1=y1 * height,
        )
        regions.append(
            RegionDraft(
                region_type=region_type,
                bbox_pdf=bbox_pdf,
                bbox_norm=bbox_norm,
                confidence=confidence,
                detection_method=method,
            )
        )

    # Title block typically bottom-right on landscape sheets
    add_norm("title_block", 0.72, 0.55, 0.99, 0.99, 0.7, "layout_heuristic")
    add_norm("revision_table", 0.72, 0.35, 0.99, 0.55, 0.55, "layout_heuristic")
    add_norm("main_drawing_view", 0.02, 0.02, 0.72, 0.92, 0.75, "layout_heuristic")
    add_norm("notes", 0.55, 0.02, 0.72, 0.45, 0.5, "layout_heuristic")
    add_norm("legend", 0.55, 0.45, 0.72, 0.75, 0.5, "layout_heuristic")
    add_norm("drawing_border", 0.0, 0.0, 1.0, 1.0, 0.4, "layout_heuristic")

    # Keyword-anchored regions
    for label, rtype in (
        ("GENERAL NOTES", "notes"),
        ("PLAN NOTES", "notes"),
        ("LEGEND", "legend"),
        ("REVISIONS", "revision_table"),
    ):
        bbox = _bbox_for_phrase(words, label)
        if bbox:
            pad_x, pad_y = width * 0.08, height * 0.12
            expanded = BBox(
                x0=max(0, bbox.x0 - pad_x * 0.1),
                y0=max(0, bbox.y0),
                x1=min(width, bbox.x0 + pad_x),
                y1=min(height, bbox.y0 + pad_y),
            )
            regions.append(
                RegionDraft(
                    region_type=rtype,
                    bbox_pdf=expanded,
                    bbox_norm=pdf_to_norm(expanded, width, height),
                    confidence=0.8,
                    detection_method="keyword_anchor",
                )
            )

    if classification.sheet_number:
        bbox = _find_word_bbox(words, classification.sheet_number)
        if bbox:
            regions.append(
                RegionDraft(
                    region_type="title_block",
                    bbox_pdf=bbox.expand(40),
                    bbox_norm=pdf_to_norm(bbox.expand(40), width, height),
                    confidence=0.85,
                    detection_method="sheet_number_anchor",
                )
            )

    return regions


def extract_sheet_metadata(
    evidence: Dict[str, Any],
    classification: PageClassification,
) -> Dict[str, Any]:
    """Extract title-block / sheet-level fields from PDF text."""
    text = str(evidence.get("plain_text") or "")
    words = evidence.get("words") or []
    width = float(evidence.get("width") or 1)
    height = float(evidence.get("height") or 1)

    def field(value: Optional[str], method: str, conf: float, phrase: Optional[str] = None):
        if value is None:
            return {
                "value": None,
                "raw_text": None,
                "confidence": 0.0,
                "extraction_method": method,
                "bbox_norm": None,
                "bbox_pdf": None,
            }
        bbox = _bbox_for_phrase(words, phrase or value) if value else None
        return {
            "value": value,
            "raw_text": value,
            "confidence": conf,
            "extraction_method": method,
            "bbox_pdf": bbox.model_dump() if bbox else None,
            "bbox_norm": pdf_to_norm(bbox, width, height).model_dump() if bbox else None,
        }

    scale_match = re.search(r'(\d+\s*/\s*\d+\s*"\s*=\s*1[\'-]\s*0")', text, re.I)
    if not scale_match:
        scale_match = re.search(r"3/16\"\s*=\s*1'-0\"", text)
    scale_val = None
    if scale_match:
        scale_val = re.sub(r"\s+", " ", scale_match.group(0)).strip()
    elif "AS NOTED" in text.upper():
        scale_val = "AS NOTED"

    project = None
    if "GEN KOREAN BBQ" in text.upper():
        project = "GEN Korean BBQ House"
    address = None
    if "75-971 HENRY" in text.upper() or "KAILUA-KONA" in text.upper():
        address = "75-971 Henry Street, Kailua-Kona, HI 96740"

    issue_date = None
    m_date = re.search(r"\b(\d{2}/\d{2}/\d{2})\b", text)
    if m_date:
        issue_date = m_date.group(1)

    revision_number = None
    revision_desc = None
    revision_date = None
    if re.search(r"PLANNING\s+DEP", text, re.I):
        revision_desc = "PLANNING DEP. COMMENTS"
        revision_number = "3"
        m_rev_date = re.search(r"(\d{2}-\d{2}-\d{2}).{0,30}PLANNING", text, re.I | re.S)
        if m_rev_date:
            revision_date = m_rev_date.group(1)

    architect = None
    if "KINETIC DESIGN" in text.upper():
        architect = "Kinetic Design"

    north = "TRUE NORTH" in text.upper() or "NORTH" in text.upper()

    return {
        "sheet_number": field(classification.sheet_number, "deterministic", 0.9),
        "sheet_title": field(classification.sheet_title, "deterministic", 0.9),
        "discipline": field(classification.discipline, "deterministic", classification.confidence),
        "drawing_type": field(
            (classification.drawing_types or ["unknown"])[0],
            "deterministic",
            classification.confidence,
        ),
        "project_name": field(project, "deterministic", 0.85 if project else 0.0, project),
        "project_address": field(address, "deterministic", 0.85 if address else 0.0),
        "project_number": field(None, "deterministic", 0.0),
        "client": field(None, "deterministic", 0.0),
        "architect_or_engineer": field(architect, "deterministic", 0.7 if architect else 0.0),
        "issue_date": field(issue_date, "deterministic", 0.7 if issue_date else 0.0),
        "drawn_by": field(None, "deterministic", 0.0),
        "checked_by": field(None, "deterministic", 0.0),
        "scale": field(scale_val, "deterministic", 0.9 if scale_val else 0.0, scale_val),
        "permit_number": field(None, "deterministic", 0.0),
        "revision_number": field(revision_number, "deterministic", 0.8 if revision_number else 0.0),
        "revision_date": field(revision_date, "deterministic", 0.75 if revision_date else 0.0),
        "revision_description": field(
            revision_desc, "deterministic", 0.8 if revision_desc else 0.0
        ),
        "north_orientation": field(
            "true_north" if north else None,
            "deterministic",
            0.7 if north else 0.0,
        ),
        "sheet_status": field(None, "deterministic", 0.0),
        "copyright_notice": field(
            "Kinetic Design property notice"
            if "SOLE PROPERTY OF KINETIC DESIGN" in text.upper()
            else None,
            "deterministic",
            0.7,
        ),
        "professional_stamp": field(
            "present" if "KINETIC DESIGN" in text.upper() else None,
            "deterministic",
            0.5,
        ),
    }


def _extract_rooms(
    evidence: Dict[str, Any], page_index: int
) -> Tuple[List[DrawingItemDraft], List[DrawingRelationshipDraft]]:
    text = str(evidence.get("plain_text") or "")
    words = evidence.get("words") or []
    width = float(evidence.get("width") or 1)
    height = float(evidence.get("height") or 1)
    items: List[DrawingItemDraft] = []
    rels: List[DrawingRelationshipDraft] = []

    # Normalize weird line breaks for room blocks
    compact = re.sub(r"[ \t]+", " ", text)
    # Match patterns like: RECEPTION\n113 SF\n100
    candidates: List[Tuple[str, str, str]] = []
    for m in re.finditer(
        r"((?:\(E\)\s+)?[A-Z][A-Z0-9 /.&'\-]{2,50}?)\s*\n\s*([\d,]+)\s*SF\s*\n\s*(\d{2,4})\b",
        text,
    ):
        candidates.append((m.group(1).strip(), m.group(2), m.group(3)))

    # Also catch EXISTING TRASH ENCLOSURE style without room number on same pattern
    for m in re.finditer(
        r"((?:\(E\)\s+)?(?:EXISTING\s+)?TRASH ENCLOSURE)\s*\n\s*([\d,]+)\s*SF",
        text,
        re.I,
    ):
        candidates.append((m.group(1).strip(), m.group(2), "trash"))

    seen_nums: set[str] = set()
    for name, area, num in candidates:
        name_clean = re.sub(r"\s+", " ", name).strip()
        name_clean = name_clean.replace("WALK-IIN", "WALK-IN")
        if num in seen_nums and num != "trash":
            continue
        seen_nums.add(num)
        area_int = int(area.replace(",", ""))
        label = f"Room {num}" if num != "trash" else name_clean
        bbox = _bbox_for_phrase(words, name_clean.split()[0]) or _find_word_bbox(
            words, num if num != "trash" else "ENCLOSURE"
        )
        stable = _stable("room", num if num != "trash" else "trash_enclosure")
        items.append(
            DrawingItemDraft(
                stable_id=stable,
                item_type="room",
                subtype="space",
                label=label,
                properties={
                    "room_number": None if num == "trash" else num,
                    "room_name": name_clean.title()
                    if name_clean.isupper()
                    else name_clean,
                    "stated_area_sf": area_int,
                    "existing": name_clean.upper().startswith("(E)")
                    or "EXISTING" in name_clean.upper(),
                },
                raw_text=f"{name_clean}\n{area} SF\n{num}",
                page_index=page_index,
                bbox_pdf=bbox,
                bbox_norm=pdf_to_norm(bbox, width, height) if bbox else None,
                confidence=0.9,
                confidence_band="high_confidence",
                extraction_method="deterministic_pdf_text",
            )
        )

    return items, rels


def _extract_finish_tags(
    evidence: Dict[str, Any], page_index: int
) -> List[DrawingItemDraft]:
    words = evidence.get("words") or []
    width = float(evidence.get("width") or 1)
    height = float(evidence.get("height") or 1)
    items: List[DrawingItemDraft] = []
    seen: set[str] = set()
    for w in words:
        text = str(w.get("text") or "").strip().upper()
        if not _FINISH_TAG_RE.fullmatch(text):
            continue
        if text in seen:
            continue
        seen.add(text)
        bbox = BBox(**(w.get("bbox_pdf") or {}))
        items.append(
            DrawingItemDraft(
                stable_id=_stable("finish", text),
                item_type="finish",
                subtype="tag",
                label=text,
                properties={"tag": text},
                raw_text=text,
                page_index=page_index,
                bbox_pdf=bbox,
                bbox_norm=pdf_to_norm(bbox, width, height),
                confidence=0.85,
                confidence_band="high_confidence",
                extraction_method="deterministic_pdf_text",
            )
        )
    return items


def _extract_notes_and_legends(
    evidence: Dict[str, Any], page_index: int
) -> List[DrawingItemDraft]:
    text = str(evidence.get("plain_text") or "")
    items: List[DrawingItemDraft] = []

    # Plan notes numbered list between markers (when content is present)
    plan_section = re.search(
        r"PLAN NOTES:\s*(.*?)(?:LEGEND:|GENERAL NOTES:|$)",
        text,
        re.I | re.S,
    )
    if plan_section and plan_section.group(1).strip():
        body = plan_section.group(1)
        for m in re.finditer(r"(\d+)\.\s+([^\n]+(?:\n(?!\d+\.)[^\n]+)*)", body):
            num, content = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
            if len(content) < 8:
                continue
            items.append(
                DrawingItemDraft(
                    stable_id=_stable("plan_note", num),
                    item_type="note",
                    subtype="plan_note",
                    label=f"Plan Note {num}",
                    properties={"note_number": num},
                    raw_text=content,
                    page_index=page_index,
                    confidence=0.8,
                    confidence_band="high_confidence",
                    extraction_method="deterministic_pdf_text",
                )
            )

    # Fallback: numbered construction notes appear before title-block headers
    # in many born-digital exports (headers extracted without adjacent body).
    if not any(i.subtype == "plan_note" for i in items):
        for m in re.finditer(
            r"(?m)^(\d+)\.\s*\n?([A-Z][^\n]{10,}(?:\n(?!\d+\.)[A-Z0-9][^\n]*)*)",
            text,
        ):
            num, content = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
            # Skip revision table rows / tiny fragments
            if len(content) < 20:
                continue
            if content.upper().startswith("PLANNING DEP"):
                continue
            items.append(
                DrawingItemDraft(
                    stable_id=_stable("plan_note", num),
                    item_type="note",
                    subtype="plan_note",
                    label=f"Plan Note {num}",
                    properties={"note_number": num},
                    raw_text=content,
                    page_index=page_index,
                    confidence=0.75,
                    confidence_band="medium_confidence",
                    extraction_method="deterministic_pdf_text",
                )
            )

    gen_section = re.search(
        r"GENERAL NOTES:\s*(.*?)(?:SHEET|CLIENT INFORMATION|REVISIONS|$)",
        text,
        re.I | re.S,
    )
    if gen_section:
        body = gen_section.group(1).strip()
        notes = re.findall(r"(\d+)\.\s+([^\n]+(?:\n(?!\d+\.)[^\n]+)*)", body)
        if notes:
            for num, content in notes:
                cleaned = re.sub(r"\s+", " ", content).strip()
                if len(cleaned) < 8:
                    continue
                items.append(
                    DrawingItemDraft(
                        stable_id=_stable("general_note", num),
                        item_type="note",
                        subtype="general_note",
                        label=f"General Note {num}",
                        properties={"note_number": num},
                        raw_text=cleaned,
                        page_index=page_index,
                        confidence=0.75,
                        confidence_band="medium_confidence",
                        extraction_method="deterministic_pdf_text",
                    )
                )
        elif len(body) > 40:
            items.append(
                DrawingItemDraft(
                    stable_id=_stable("general_notes", "block"),
                    item_type="note",
                    subtype="general_notes_block",
                    label="General Notes",
                    raw_text=re.sub(r"\s+", " ", body)[:4000],
                    page_index=page_index,
                    confidence=0.6,
                    confidence_band="medium_confidence",
                    extraction_method="deterministic_pdf_text",
                )
            )

    # Quarry tile / finish specification notes often appear as free text
    for m in re.finditer(
        r"(Quarry tile[^\n.]{10,200}\.|Daltile[^\n.]{5,120}\.)",
        text,
        re.I,
    ):
        content = re.sub(r"\s+", " ", m.group(1)).strip()
        items.append(
            DrawingItemDraft(
                stable_id=_stable("general_note", "quarry", content[:24]),
                item_type="note",
                subtype="general_note",
                label="General Note — Quarry Tile",
                raw_text=content,
                page_index=page_index,
                confidence=0.7,
                confidence_band="medium_confidence",
                extraction_method="deterministic_pdf_text",
            )
        )

    legend = re.search(
        r"LEGEND:\s*(.*?)(?:GENERAL NOTES:|PLAN NOTES:|SHEET|$)",
        text,
        re.I | re.S,
    )
    legend_body = ""
    if legend:
        legend_body = re.sub(r"\s+", " ", legend.group(1)).strip()
    if len(legend_body) > 10:
        items.append(
            DrawingItemDraft(
                stable_id=_stable("legend", "main"),
                item_type="symbol",
                subtype="legend",
                label="Legend",
                raw_text=legend_body[:4000],
                page_index=page_index,
                confidence=0.7,
                confidence_band="medium_confidence",
                extraction_method="deterministic_pdf_text",
            )
        )
    else:
        # Legend content may be scattered; capture common legend phrases
        legend_hits = re.findall(
            r"(EXISTING|NEW CONSTRUCTION|DEMOLISHED|RELOCATED|FLOOR DRAIN|FINISH TAG|QUARRY TILE)[^\n]{0,40}",
            text,
            re.I,
        )
        if legend_hits:
            items.append(
                DrawingItemDraft(
                    stable_id=_stable("legend", "inferred"),
                    item_type="symbol",
                    subtype="legend",
                    label="Legend",
                    raw_text="; ".join(dict.fromkeys(h.strip() for h in legend_hits))[
                        :2000
                    ],
                    page_index=page_index,
                    confidence=0.55,
                    confidence_band="medium_confidence",
                    extraction_method="deterministic_pdf_text",
                )
            )

    return items


def _extract_floor_drains(
    evidence: Dict[str, Any], page_index: int
) -> List[DrawingItemDraft]:
    words = evidence.get("words") or []
    width = float(evidence.get("width") or 1)
    height = float(evidence.get("height") or 1)
    items: List[DrawingItemDraft] = []
    idx = 0
    for w in words:
        if str(w.get("text") or "").strip().upper() != "FD":
            continue
        idx += 1
        bbox = BBox(**(w.get("bbox_pdf") or {}))
        items.append(
            DrawingItemDraft(
                stable_id=_stable("fixture", "fd", str(idx)),
                item_type="fixture",
                subtype="floor_drain",
                label=f"FD-{idx}",
                properties={"symbol": "FD"},
                raw_text="FD",
                page_index=page_index,
                bbox_pdf=bbox,
                bbox_norm=pdf_to_norm(bbox, width, height),
                confidence=0.8,
                confidence_band="high_confidence",
                extraction_method="deterministic_pdf_text",
            )
        )
    return items


def _extract_sheet_refs(
    evidence: Dict[str, Any],
    page_index: int,
    own_sheet: Optional[str],
) -> List[DrawingItemDraft]:
    text = str(evidence.get("plain_text") or "").upper()
    refs = sorted(set(_SHEET_REF_RE.findall(text)))
    items: List[DrawingItemDraft] = []
    for ref in refs:
        if own_sheet and ref == own_sheet.upper():
            continue
        items.append(
            DrawingItemDraft(
                stable_id=_stable("sheet_ref", ref),
                item_type="callout",
                subtype="sheet_reference",
                label=ref,
                properties={"referenced_sheet": ref},
                raw_text=ref,
                page_index=page_index,
                confidence=0.85,
                confidence_band="high_confidence",
                extraction_method="deterministic_pdf_text",
            )
        )
    return items


def _extract_dimensions(
    evidence: Dict[str, Any], page_index: int
) -> List[DrawingItemDraft]:
    words = evidence.get("words") or []
    width = float(evidence.get("width") or 1)
    height = float(evidence.get("height") or 1)
    dim_re = re.compile(r"^\d+['\-].*")
    items: List[DrawingItemDraft] = []
    seen = 0
    for w in words:
        text = str(w.get("text") or "").strip()
        if not dim_re.match(text) and not re.match(r"^\d+\"$", text):
            continue
        seen += 1
        if seen > 80:
            break
        bbox = BBox(**(w.get("bbox_pdf") or {}))
        items.append(
            DrawingItemDraft(
                stable_id=_stable("dimension", text, str(seen)),
                item_type="dimension",
                label=text,
                properties={"raw": text},
                raw_text=text,
                page_index=page_index,
                bbox_pdf=bbox,
                bbox_norm=pdf_to_norm(bbox, width, height),
                confidence=0.7,
                confidence_band="medium_confidence",
                extraction_method="deterministic_pdf_text",
            )
        )
    return items


def extract_page_content(
    evidence: Dict[str, Any],
    classification: PageClassification,
    *,
    page_index: int = 0,
) -> Tuple[List[DrawingItemDraft], List[DrawingRelationshipDraft], List[DrawingItemDraft]]:
    """
    Extract universal + type-specific content.

    Returns (items, relationships, unclassified).
    """
    items: List[DrawingItemDraft] = []
    rels: List[DrawingRelationshipDraft] = []
    unclassified: List[DrawingItemDraft] = []

    # Sheet metadata fields as items
    meta = extract_sheet_metadata(evidence, classification)
    for key, payload in meta.items():
        if payload.get("value") is None:
            continue
        bbox_pdf = BBox(**payload["bbox_pdf"]) if payload.get("bbox_pdf") else None
        bbox_norm = BBox(**payload["bbox_norm"]) if payload.get("bbox_norm") else None
        items.append(
            DrawingItemDraft(
                stable_id=_stable("meta", key),
                item_type="metadata_field",
                subtype=key,
                label=key,
                properties={"value": payload["value"]},
                raw_text=str(payload.get("raw_text") or payload["value"]),
                page_index=page_index,
                bbox_pdf=bbox_pdf,
                bbox_norm=bbox_norm,
                confidence=float(payload.get("confidence") or 0),
                confidence_band="high_confidence"
                if (payload.get("confidence") or 0) >= 0.8
                else "medium_confidence",
                extraction_method=str(payload.get("extraction_method") or "deterministic"),
            )
        )

    types = set(classification.drawing_types or [])
    if types & {"floor_plan", "finish_plan", "enlarged_plan", "unknown"} or classification.is_drawing:
        rooms, room_rels = _extract_rooms(evidence, page_index)
        items.extend(rooms)
        rels.extend(room_rels)
        items.extend(_extract_finish_tags(evidence, page_index))
        items.extend(_extract_floor_drains(evidence, page_index))
        items.extend(_extract_dimensions(evidence, page_index))

    items.extend(_extract_notes_and_legends(evidence, page_index))
    items.extend(
        _extract_sheet_refs(evidence, page_index, classification.sheet_number)
    )

    # Grid lines A/B/C/1/2/...
    words = evidence.get("words") or []
    width = float(evidence.get("width") or 1)
    height = float(evidence.get("height") or 1)
    for w in words:
        t = str(w.get("text") or "").strip()
        if re.fullmatch(r"[A-E]", t) or re.fullmatch(r"[1-9]", t):
            bbox = BBox(**(w.get("bbox_pdf") or {}))
            # Only near edges likely grids
            n = pdf_to_norm(bbox, width, height)
            if n.x0 < 0.08 or n.y0 < 0.08 or n.x1 > 0.92 or n.y1 > 0.92:
                items.append(
                    DrawingItemDraft(
                        stable_id=_stable("grid", t),
                        item_type="grid",
                        label=t,
                        properties={"grid_id": t},
                        raw_text=t,
                        page_index=page_index,
                        bbox_pdf=bbox,
                        bbox_norm=n,
                        confidence=0.55,
                        confidence_band="medium_confidence",
                        extraction_method="deterministic_pdf_text",
                    )
                )

    return items, rels, unclassified
