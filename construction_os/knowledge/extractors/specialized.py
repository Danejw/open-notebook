"""Specialized extractors with domain-focused prompts, same schema as generic."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional, Sequence

from loguru import logger

from construction_os.knowledge.extractors.base import ExtractionPayload, ExtractionResult
from construction_os.knowledge.extractors.enrich import (
    deterministic_sufficient,
    enrich_with_deterministic,
)
from construction_os.knowledge.extractors.parse import (
    extract_with_windows,
    payload_stats,
)


class _SpecializedExtractor:
    id: str
    label: str
    version: str = "1.3.0"
    auto_run: bool = False
    prompt_template: str

    async def extract(
        self,
        *,
        full_text: str,
        chunks: List[Dict[str, Any]],
        source_id: str,
        project_id: str,
        source_title: Optional[str] = None,
        file_path: Optional[str] = None,
        topics: Optional[Sequence[str]] = None,
    ) -> ExtractionResult:
        content_hash = hashlib.sha256((full_text or "").encode("utf-8")).hexdigest()
        # Deterministic first — never depend solely on LLM for structure
        seed = enrich_with_deterministic(
            ExtractionPayload(),
            full_text or "",
            title=source_title,
            file_path=file_path,
            topics=topics,
            chunks=chunks,
        )
        llm_payload = ExtractionPayload()
        if deterministic_sufficient(seed):
            logger.info(
                "{} skipping LLM for {}: deterministic already has {}",
                self.id,
                source_id,
                payload_stats(seed),
            )
            payload = seed
        else:
            try:
                llm_payload = await extract_with_windows(
                    prompt_template=self.prompt_template,
                    full_text=full_text or "",
                    source_id=source_id,
                    project_id=project_id,
                    chunks=chunks,
                    extractor=self.id,
                )
            except ValueError as e:
                logger.warning(
                    "{} KG LLM extract failed for {}: {}; using deterministic only",
                    self.id,
                    source_id,
                    e,
                )
                llm_payload = ExtractionPayload()
            payload = enrich_with_deterministic(
                llm_payload,
                full_text or "",
                title=source_title,
                file_path=file_path,
                topics=topics,
                chunks=chunks,
            )
        return ExtractionResult(
            extractor=self.id,
            extractor_version=self.version,
            payload=payload,
            content_hash=content_hash,
            stats=payload_stats(payload),
        )


class ContractKnowledgeExtractor(_SpecializedExtractor):
    id = "contract"
    label = "Contract / agreement"
    prompt_template = "knowledge/contract_extract"


class DrawingKnowledgeExtractor(_SpecializedExtractor):
    id = "drawing"
    label = "Drawing set"
    prompt_template = "knowledge/drawing_extract"


class SpecKnowledgeExtractor(_SpecializedExtractor):
    id = "spec"
    label = "Specification"
    prompt_template = "knowledge/spec_extract"


class EmailKnowledgeExtractor(_SpecializedExtractor):
    id = "email"
    label = "Email / correspondence"
    prompt_template = "knowledge/email_extract"
