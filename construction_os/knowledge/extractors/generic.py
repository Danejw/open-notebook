"""Generic corpus-agnostic knowledge extractor."""

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

EXTRACTOR_ID = "generic"
EXTRACTOR_VERSION = "1.3.0"
PROMPT_TEMPLATE = "knowledge/generic_extract"


class GenericKnowledgeExtractor:
    id = EXTRACTOR_ID
    label = "Generic (auto)"
    version = EXTRACTOR_VERSION
    auto_run = True
    prompt_template = PROMPT_TEMPLATE

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
        seed = enrich_with_deterministic(
            ExtractionPayload(),
            full_text or "",
            title=source_title,
            file_path=file_path,
            topics=topics,
        )
        if deterministic_sufficient(seed):
            logger.info(
                "Generic skipping LLM for {}: deterministic already has {}",
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
                    "Generic KG LLM extract failed for {}: {}; using deterministic only",
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
            )
        return ExtractionResult(
            extractor=self.id,
            extractor_version=self.version,
            payload=payload,
            content_hash=content_hash,
            stats=payload_stats(payload),
        )
