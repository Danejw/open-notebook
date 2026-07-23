"""Verify chat citations against retrieved evidence IDs (RAG-002)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

from construction_os.services.project_memory import extract_evidence_ids

_BRACKETED_ID_RE = re.compile(
    r"\[+\s*((?:source|note):[A-Za-z0-9_-]+)\s*\]+",
    re.IGNORECASE,
)
_BARE_ID_RE = re.compile(r"\b((?:source|note):[A-Za-z0-9_-]+)\b", re.IGNORECASE)
_EMPTY_BRACKETS_RE = re.compile(r"\[\s*\]+")
_MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")


@dataclass(frozen=True)
class CitationVerifyResult:
    """Outcome of stripping citations that are not in the allowed evidence set."""

    text: str
    cited_ids: list[str]
    kept_ids: list[str]
    removed_ids: list[str]


def collect_evidence_ids_from_texts(texts: Sequence[str]) -> list[str]:
    """Union evidence IDs from multiple texts, preserving first-seen order."""
    seen: set[str] = set()
    ordered: list[str] = []
    for text in texts:
        for evidence_id in extract_evidence_ids(text):
            if evidence_id not in seen:
                seen.add(evidence_id)
                ordered.append(evidence_id)
    return ordered


def strip_unverified_citations(
    text: str,
    allowed_ids: Sequence[str],
) -> CitationVerifyResult:
    """Remove source/note citations that are not in ``allowed_ids``.

    When ``allowed_ids`` is empty, every citation is removed (empty CONTEXT /
    no retrieved evidence). Valid citations are left unchanged.
    """
    allowed = set(allowed_ids)
    cited = extract_evidence_ids(text)
    removed = [cid for cid in cited if cid not in allowed]
    kept = [cid for cid in cited if cid in allowed]
    if not removed:
        return CitationVerifyResult(
            text=text,
            cited_ids=cited,
            kept_ids=kept,
            removed_ids=[],
        )

    remove_set = set(removed)

    def _drop_bracketed(match: re.Match[str]) -> str:
        evidence_id = match.group(1)
        return "" if evidence_id in remove_set else match.group(0)

    def _drop_bare(match: re.Match[str]) -> str:
        evidence_id = match.group(1)
        return "" if evidence_id in remove_set else match.group(0)

    cleaned = _BRACKETED_ID_RE.sub(_drop_bracketed, text)
    cleaned = _BARE_ID_RE.sub(_drop_bare, cleaned)
    cleaned = _EMPTY_BRACKETS_RE.sub("", cleaned)
    cleaned = _MULTI_SPACE_RE.sub(" ", cleaned)
    cleaned = re.sub(r" +\n", "\n", cleaned)
    cleaned = cleaned.strip()

    return CitationVerifyResult(
        text=cleaned,
        cited_ids=cited,
        kept_ids=kept,
        removed_ids=removed,
    )
