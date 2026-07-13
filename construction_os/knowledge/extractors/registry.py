"""Extractor registry for auto and manually triggered knowledge extractors."""

from __future__ import annotations

from typing import Any, Dict, List

from construction_os.knowledge.extractors.generic import GenericKnowledgeExtractor
from construction_os.knowledge.extractors.specialized import (
    ContractKnowledgeExtractor,
    DrawingKnowledgeExtractor,
    EmailKnowledgeExtractor,
    SpecKnowledgeExtractor,
)

_EXTRACTORS = {
    "generic": GenericKnowledgeExtractor(),
    "contract": ContractKnowledgeExtractor(),
    "drawing": DrawingKnowledgeExtractor(),
    "spec": SpecKnowledgeExtractor(),
    "email": EmailKnowledgeExtractor(),
}


def get_extractor(extractor_id: str):
    extractor = _EXTRACTORS.get(extractor_id)
    if not extractor:
        raise KeyError(f"Unknown knowledge extractor: {extractor_id}")
    return extractor


def list_extractors() -> List[Dict[str, Any]]:
    return [
        {
            "id": ext.id,
            "label": ext.label,
            "version": ext.version,
            "auto_run": ext.auto_run,
        }
        for ext in _EXTRACTORS.values()
    ]
