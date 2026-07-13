"""Generic corpus-agnostic knowledge extractor."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List

from ai_prompter import Prompter
from langchain_core.output_parsers.pydantic import PydanticOutputParser
from loguru import logger

from construction_os.ai.provision import provision_langchain_model
from construction_os.knowledge.extractors.base import (
    ExtractionPayload,
    ExtractionResult,
)
from construction_os.utils import clean_thinking_content
from construction_os.utils.text_utils import extract_text_content

EXTRACTOR_ID = "generic"
EXTRACTOR_VERSION = "1.0.0"
MAX_TEXT_CHARS = 24000


class GenericKnowledgeExtractor:
    id = EXTRACTOR_ID
    label = "Generic (auto)"
    version = EXTRACTOR_VERSION
    auto_run = True

    async def extract(
        self,
        *,
        full_text: str,
        chunks: List[Dict[str, Any]],
        source_id: str,
        project_id: str,
    ) -> ExtractionResult:
        content_hash = hashlib.sha256((full_text or "").encode("utf-8")).hexdigest()
        text = (full_text or "")[:MAX_TEXT_CHARS]
        if not text.strip():
            return ExtractionResult(
                extractor=self.id,
                extractor_version=self.version,
                payload=ExtractionPayload(),
                content_hash=content_hash,
                stats={"entities": 0, "mentions": 0, "claims": 0, "relations": 0},
            )

        parser = PydanticOutputParser(pydantic_object=ExtractionPayload)
        prompt = Prompter(
            prompt_template="knowledge/generic_extract",
            parser=parser,
        ).render(
            data={
                "text": text,
                "chunk_count": len(chunks),
                "source_id": source_id,
                "project_id": project_id,
            }
        )
        model = await provision_langchain_model(
            prompt,
            None,
            "tools",
            max_tokens=4000,
            structured=dict(type="json"),
        )
        ai_message = await model.ainvoke(prompt)
        message_content = extract_text_content(ai_message.content)
        cleaned = clean_thinking_content(message_content)
        try:
            payload = parser.parse(cleaned)
        except Exception as e:
            logger.warning(f"Generic KG parse failed, returning empty payload: {e}")
            payload = ExtractionPayload()

        stats = {
            "entities": len(payload.entities),
            "mentions": len(payload.mentions),
            "claims": len(payload.claims),
            "relations": len(payload.relations),
        }
        return ExtractionResult(
            extractor=self.id,
            extractor_version=self.version,
            payload=payload,
            content_hash=content_hash,
            stats=stats,
        )
