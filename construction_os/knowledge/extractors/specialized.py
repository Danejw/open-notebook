"""Specialized extractors with domain-focused prompts, same schema as generic."""

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

MAX_TEXT_CHARS = 24000


class _SpecializedExtractor:
    id: str
    label: str
    version: str = "1.0.0"
    auto_run: bool = False
    prompt_template: str

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
            prompt_template=self.prompt_template,
            parser=parser,
        ).render(
            data={
                "text": text,
                "chunk_count": len(chunks),
                "source_id": source_id,
                "project_id": project_id,
                "extractor": self.id,
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
            logger.warning(f"{self.id} KG parse failed, returning empty payload: {e}")
            payload = ExtractionPayload()

        return ExtractionResult(
            extractor=self.id,
            extractor_version=self.version,
            payload=payload,
            content_hash=content_hash,
            stats={
                "entities": len(payload.entities),
                "mentions": len(payload.mentions),
                "claims": len(payload.claims),
                "relations": len(payload.relations),
            },
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
