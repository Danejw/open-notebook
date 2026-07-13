"""Heuristic extractor selection for auto knowledge-graph builds."""

from __future__ import annotations

import re
from typing import Any, Optional

_DRAWING_RE = re.compile(
    r"("
    r"\bsheet\b|\bdrawing\b|\bplan\b|\belevation\b|\bdetail\b|"
    r"\bfloor\s*plan\b|\bplumbing\b|\bmechanical\b|\belectrical\b|"
    r"\bHVAC\b|\bP[-_]?\d{2,4}\b|\bA[-_]?\d{2,4}\b|\bM[-_]?\d{2,4}\b|"
    r"\bE[-_]?\d{2,4}\b|\bS[-_]?\d{2,4}\b"
    r")",
    re.IGNORECASE,
)
_SPEC_RE = re.compile(
    r"("
    r"\bspec(?:ification)?s?\b|\bCSI\b|\bdivision\b|"
    r"\b0[0-9]\s*[0-9]{2}\s*[0-9]{2}\b|\bsection\s+\d"
    r")",
    re.IGNORECASE,
)
_EMAIL_RE = re.compile(
    r"("
    r"\bfrom:\s|\bto:\s|\bsubject:\s|\bcc:\s|"
    r"\bemail\b|\bcorrespondence\b|\binbox\b|\.eml\b|\.msg\b"
    r")",
    re.IGNORECASE,
)
_CONTRACT_RE = re.compile(
    r"("
    r"\bcontract\b|\bagreement\b|\bMSA\b|\bSOW\b|\bamendment\b|"
    r"\bterms\s+and\s+conditions\b|\baddendum\b"
    r")",
    re.IGNORECASE,
)


def _asset_path(source: Any) -> str:
    asset = getattr(source, "asset", None)
    if asset is None:
        return ""
    if isinstance(asset, dict):
        return str(asset.get("file_path") or asset.get("url") or "")
    return str(
        getattr(asset, "file_path", None) or getattr(asset, "url", None) or ""
    )


def select_extractor_for_source(source: Any) -> str:
    """
    Choose extractor id from source title / file path / text heuristics.

    Used when the auto pipeline submits extractor=\"generic\".
    Explicit specialized API choices bypass this.
    """
    title = str(getattr(source, "title", None) or "")
    path = _asset_path(source)
    # Frontmatter / body clues (e.g. document_type: drawing-sheet, sheet: P001)
    full_text = str(getattr(source, "full_text", None) or "")[:2000]
    blob = f"{title}\n{path}\n{full_text}"

    if _DRAWING_RE.search(blob) or re.search(
        r"(?i)document_type\s*:\s*drawing", blob
    ):
        return "drawing"
    if _SPEC_RE.search(blob):
        return "spec"
    if _EMAIL_RE.search(blob):
        return "email"
    if _CONTRACT_RE.search(blob):
        return "contract"
    return "generic"


def select_extractor_id(
    *,
    requested: Optional[str],
    source: Any,
    auto_select_generic: bool = True,
) -> str:
    """Resolve final extractor id; auto-upgrade generic when requested."""
    extractor = (requested or "generic").strip() or "generic"
    if auto_select_generic and extractor == "generic":
        chosen = select_extractor_for_source(source)
        return chosen
    return extractor
