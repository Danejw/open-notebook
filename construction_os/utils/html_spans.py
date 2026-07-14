"""Editable <span> helpers for HTML-native bid documents."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List

# Non-greedy match for span open/close; v1 assumes no nested <span> in templates.
_SPAN_RE = re.compile(r"(<span\b[^>]*>)(.*?)(</span>)", re.IGNORECASE | re.DOTALL)


class StructureChangedError(ValueError):
    """Raised when a Page-mode edit would change HTML structure."""


@dataclass(frozen=True)
class SpanField:
    """One editable span in document order."""

    index: int
    text: str
    start: int
    end: int


def extract_spans(html: str) -> List[SpanField]:
    """Return editable span text fields in document order."""
    spans: List[SpanField] = []
    for i, match in enumerate(_SPAN_RE.finditer(html)):
        spans.append(
            SpanField(
                index=i,
                text=match.group(2),
                start=match.start(2),
                end=match.end(2),
            )
        )
    return spans


def apply_span_updates(html: str, updates: Dict[int, str]) -> str:
    """Replace span text by index. Indices match extract_spans()."""
    if not updates:
        return html

    parts: List[str] = []
    last = 0
    for i, match in enumerate(_SPAN_RE.finditer(html)):
        parts.append(html[last : match.start(2)])
        parts.append(updates.get(i, match.group(2)))
        last = match.end(2)
    parts.append(html[last:])
    return "".join(parts)


def assert_same_span_structure(before: str, after: str) -> None:
    """Ensure Page-mode edits did not add/remove editable spans."""
    before_count = len(extract_spans(before))
    after_count = len(extract_spans(after))
    if before_count != after_count:
        raise StructureChangedError(
            "Page edits cannot add or remove spans; use Code view"
        )
