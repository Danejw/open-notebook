"""Merge LLM extraction with deterministic parsers (crossrefs + bootstrap)."""

from __future__ import annotations

from typing import Optional, Sequence

from loguru import logger

from construction_os.knowledge.extractors.base import ExtractionPayload
from construction_os.knowledge.extractors.bootstrap import bootstrap_entities
from construction_os.knowledge.extractors.crossrefs import extract_crossrefs
from construction_os.knowledge.extractors.parse import (
    merge_extraction_payloads,
    payload_stats,
)


def enrich_with_deterministic(
    llm_payload: ExtractionPayload,
    text: str,
    *,
    title: Optional[str] = None,
    file_path: Optional[str] = None,
    topics: Optional[Sequence[str]] = None,
) -> ExtractionPayload:
    """
    Always layer deterministic structure on LLM output.

    Order: crossrefs (typed REFERENCES) → bootstrap entities → LLM.
    Crossrefs win relation keys; bootstrap fills entities when LLM is empty.
    """
    content = text or ""
    cross = extract_crossrefs(content)
    boot = bootstrap_entities(
        content,
        title=title,
        file_path=file_path,
        topics=list(topics) if topics else None,
    )
    merged = merge_extraction_payloads([cross, boot, llm_payload])
    stats = payload_stats(merged)
    logger.info(
        "KG deterministic enrich: crossrefs ents={} rels={}, bootstrap ents={}, "
        "llm ents={} rels={}, merged={}",
        len(cross.entities),
        len(cross.relations),
        len(boot.entities),
        len(llm_payload.entities),
        len(llm_payload.relations),
        stats,
    )
    return merged


def deterministic_sufficient(payload: ExtractionPayload) -> bool:
    """True when parsers already produced a usable graph without the LLM.

    Requires at least one relation so orphan-entity graphs still get an LLM pass.
    """
    return len(payload.entities) >= 3 and len(payload.relations) >= 1
