"""Deterministic cross-reference extraction for drawings and specs."""

from __future__ import annotations

import re
from typing import List, Optional, Set, Tuple

from construction_os.knowledge.extractors.base import (
    ExtractedEntity,
    ExtractedRelation,
    ExtractionPayload,
)

# SEE 3/A-501, DETAIL 3/A-501, SECTION A-501, SEE A501, REF P201, SEE SHEET P-201
# Also OCR-ish: SEE3/A501, SEE SHT P201 (optional whitespace; SHT synonym)
_CALLOUT_RE = re.compile(
    r"(?i)\b(?:SEE(?:\s+ALSO)?|DETAIL|SECTION|REF(?:ER(?:ENCE|TO))?|PER)\s*"
    r"(?:(?:SHEET|SHT\.?)\s+)?"
    r"(?P<target>"
    r"\d+\s*/\s*(?:FP|FA|FS|EL|PL|ME|ID|AV|LA|IR|[ASMEPCLTGHDWNK])-?\d{2,4}"
    r"|(?:FP|FA|FS|EL|PL|ME|ID|AV|LA|IR|[ASMEPCLTGHDWNK])-?\d{2,4}"
    r")\b"
)

# Sheet numbers with construction discipline prefixes (hyphen optional)
_SHEET_DISC = (
    r"(?:FP|FA|FS|EL|PL|ME|ID|AV|LA|IR|A|S|M|E|P|C|L|T|G|H|D|W|N|K)"
)
_SHEET_RE = re.compile(
    rf"\b(?P<sheet>{_SHEET_DISC}(?:-\d{{2,4}}|\d{{2,4}}))\b"
)

# CSI division style: 09 30 00
_CSI_RE = re.compile(r"\b(?P<csi>\d{2}\s+\d{2}\s+\d{2})\b")

# "see section 3.2.1" or "see section 09 30 00"
_SEE_SECTION_RE = re.compile(
    r"(?i)\bsee\s+section\s+(?P<section>\d{2}\s+\d{2}\s+\d{2}|[\d.]+)\b"
)

# Frontmatter sheet: P001
_FRONTMATTER_SHEET_RE = re.compile(
    rf"(?im)^\s*sheet\s*:\s*[\"']?(?P<sheet>{_SHEET_DISC}-?\d{{2,4}})[\"']?\s*$"
)

# Sheet index table rows
_INDEX_ROW_RE = re.compile(
    rf"(?im)^\s*\|\s*(?P<sheet>{_SHEET_DISC}-?\d{{2,4}})\s*\|\s*(?P<title>[^|\n]{{2,80}})\|"
)

_DEFAULT_FROM = "Document"
_PARSER_CONFIDENCE = 0.9
_MAX_CO_DOC_RELATIONS = 40


def _canon_label(raw: str) -> str:
    """Normalize whitespace and slash spacing for stable labels."""
    label = re.sub(r"\s*/\s*", "/", (raw or "").strip())
    label = re.sub(r"\s+", " ", label)
    # Normalize sheet IDs to uppercase without forcing hyphens
    if re.fullmatch(r"[A-Za-z]-?\d{2,4}", label):
        return label.upper()
    return label


def count_detected_callouts(text: str) -> int:
    """Count explicit callout / see-section phrases in text."""
    if not text:
        return 0
    callouts = len(_CALLOUT_RE.findall(text))
    sections = len(_SEE_SECTION_RE.findall(text))
    return callouts + sections


def _preceding_sheet(text: str, end: int) -> str:
    matches = list(_SHEET_RE.finditer(text.upper(), 0, end))
    if not matches:
        fm = _FRONTMATTER_SHEET_RE.search(text)
        if fm:
            return _canon_label(fm.group("sheet"))
        return _DEFAULT_FROM
    return matches[-1].group("sheet")


def _frontmatter_sheet(text: str) -> Optional[str]:
    m = _FRONTMATTER_SHEET_RE.search(text or "")
    return _canon_label(m.group("sheet")) if m else None


def _resolve_current_sheet(text: str) -> str:
    """Frontmatter sheet, else first sheet ID in body, else Document."""
    fm = _frontmatter_sheet(text)
    if fm:
        return fm
    first = _SHEET_RE.search((text or "").upper())
    if first:
        return _canon_label(first.group("sheet"))
    return _DEFAULT_FROM


def extract_crossrefs(text: str) -> ExtractionPayload:
    """Parse explicit cross-refs into Reference entities and REFERENCES relations."""
    if not text:
        return ExtractionPayload()

    entities: List[ExtractedEntity] = []
    relations: List[ExtractedRelation] = []
    entity_keys: Set[str] = set()
    relation_keys: Set[Tuple[str, str, str]] = set()

    def add_entity(label: str) -> str:
        canon = _canon_label(label)
        if not canon:
            return canon
        key = canon.lower()
        if key not in entity_keys:
            entity_keys.add(key)
            entities.append(ExtractedEntity(label=canon, type="Reference"))
        return canon

    def add_relation(from_label: str, to_label: str) -> bool:
        frm = add_entity(from_label)
        to = add_entity(to_label)
        if not frm or not to or frm.lower() == to.lower():
            return False
        key = ("REFERENCES", frm.lower(), to.lower())
        if key in relation_keys:
            return False
        relation_keys.add(key)
        relations.append(
            ExtractedRelation(
                type="REFERENCES",
                from_label=frm,
                from_type="Reference",
                to_label=to,
                to_type="Reference",
                confidence=_PARSER_CONFIDENCE,
            )
        )
        return True

    current_sheet = _frontmatter_sheet(text)
    if current_sheet:
        add_entity(current_sheet)

    for m in _CALLOUT_RE.finditer(text):
        target = _canon_label(m.group("target"))
        # Drop leading detail number path like 3/A-501 → keep A-501 as entity too
        source = _preceding_sheet(text, m.start())
        if current_sheet and source == _DEFAULT_FROM:
            source = current_sheet
        add_relation(source, target)

    for m in _SEE_SECTION_RE.finditer(text):
        section = _canon_label(m.group("section"))
        source = _preceding_sheet(text, m.start())
        if current_sheet and source == _DEFAULT_FROM:
            source = current_sheet
        add_relation(source, section)

    # Sheet index → REFERENCES from current sheet to listed sheets
    for m in _INDEX_ROW_RE.finditer(text):
        listed = _canon_label(m.group("sheet"))
        add_entity(listed)
        if current_sheet:
            add_relation(current_sheet, listed)

    # Register remaining sheet / CSI identifiers as entities
    sheet_labels: List[str] = []
    for m in _SHEET_RE.finditer(text.upper()):
        label = add_entity(m.group("sheet"))
        if label and label not in sheet_labels:
            sheet_labels.append(label)
    csi_labels: List[str] = []
    for m in _CSI_RE.finditer(text):
        label = add_entity(m.group("csi"))
        if label and label not in csi_labels:
            csi_labels.append(label)

    # Co-document edges: current sheet → other sheets / CSI codes (capped)
    anchor = current_sheet or _resolve_current_sheet(text)
    if anchor and anchor != _DEFAULT_FROM:
        add_entity(anchor)
    co_doc_added = 0
    for label in sheet_labels + csi_labels:
        if co_doc_added >= _MAX_CO_DOC_RELATIONS:
            break
        if add_relation(anchor, label):
            co_doc_added += 1

    return ExtractionPayload(entities=entities, relations=relations)


def merge_with_deterministic_crossrefs(
    llm_payload: ExtractionPayload, text: str
) -> ExtractionPayload:
    """Merge LLM extraction with deterministic cross-ref payload."""
    from construction_os.knowledge.extractors.parse import merge_extraction_payloads

    deterministic = extract_crossrefs(text or "")
    # Prefer deterministic relations first so they win dedupe keys
    return merge_extraction_payloads([deterministic, llm_payload])
