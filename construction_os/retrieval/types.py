"""Shared types for the evidence retriever used by Search and Ask."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

RetrievalMode = Literal["auto", "vector", "hybrid", "graph"]


class EvidenceItem(BaseModel):
    """A single ranked retrieval hit ready for LLM context assembly."""

    id: str
    parent_id: Optional[str] = None
    title: Optional[str] = None
    score: float = 0.0
    matches: List[Any] = Field(default_factory=list)
    content: Optional[Any] = None
    source: Literal["vector", "text", "graph"] = "vector"
    raw: Dict[str, Any] = Field(default_factory=dict)

    def to_search_result(self) -> Dict[str, Any]:
        """Serialize to the shape expected by Ask prompts and Search API."""
        result = dict(self.raw) if self.raw else {}
        result.update(
            {
                "id": self.id,
                "parent_id": self.parent_id,
                "title": self.title,
            }
        )
        if self.matches:
            result["matches"] = self.matches
        if self.content is not None and "content" not in result:
            result["content"] = self.content
        if self.source == "vector":
            result.setdefault("similarity", self.score)
        elif self.source == "text":
            result.setdefault("relevance", self.score)
        else:
            result.setdefault("score", self.score)
        return result


class EvidencePath(BaseModel):
    """Optional graph path explaining why an entity/claim was retrieved."""

    nodes: List[str] = Field(default_factory=list)
    edges: List[str] = Field(default_factory=list)
    description: str = ""
    confidence: float = 0.0
    source_ids: List[str] = Field(default_factory=list)
    chunk_ids: List[str] = Field(default_factory=list)


class EvidenceBundle(BaseModel):
    """Fused retrieval output for Ask / Search consumers."""

    items: List[EvidenceItem] = Field(default_factory=list)
    paths: List[EvidencePath] = Field(default_factory=list)
    retrieval_mode_used: RetrievalMode = "vector"
    fallback_reason: Optional[str] = None

    def to_search_results(self) -> List[Dict[str, Any]]:
        return [item.to_search_result() for item in self.items]
