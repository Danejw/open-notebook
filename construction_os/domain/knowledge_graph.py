"""Knowledge graph domain models and repository helpers."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, ClassVar, Dict, List, Optional, Tuple

from construction_os.database.repository import (
    ensure_record_id,
    repo_query,
)
from construction_os.domain.base import ObjectModel
from construction_os.retrieval.types import EvidenceItem, EvidencePath

GENERIC_ENTITY_TYPES = (
    "Person",
    "Organization",
    "Location",
    "Date",
    "Requirement",
    "Deliverable",
    "Reference",
    "Topic",
    "Decision",
    "Issue",
    "Specification",
)

_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")
_RECORD_FIELDS = (
    "project_id",
    "source_id",
    "chunk_id",
    "entity_id",
    "subject_id",
    "object_id",
    "from_id",
    "to_id",
    "command_id",
)


def normalize_entity_key(label: str) -> str:
    """Normalize an entity label into a stable merge key."""
    return _NORMALIZE_RE.sub(" ", (label or "").lower()).strip()


class _KgModel(ObjectModel):
    """ObjectModel that coerces record reference fields before save."""

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        for field in _RECORD_FIELDS:
            if field in data and data[field] is not None:
                data[field] = ensure_record_id(data[field])
        return data


class KgEntity(_KgModel):
    table_name: ClassVar[str] = "kg_entity"
    type: str
    label: str
    normalized_key: str
    project_id: str
    source_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    extractor: Optional[str] = None
    extractor_version: Optional[str] = None
    nullable_fields: ClassVar[set[str]] = {
        "source_id",
        "metadata",
        "extractor",
        "extractor_version",
    }


class KgMention(_KgModel):
    table_name: ClassVar[str] = "kg_mention"
    text: str
    entity_type_hint: Optional[str] = None
    entity_id: Optional[str] = None
    project_id: str
    source_id: str
    chunk_id: Optional[str] = None
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    confidence: Optional[float] = None
    extractor: Optional[str] = None
    extractor_version: Optional[str] = None
    nullable_fields: ClassVar[set[str]] = {
        "entity_type_hint",
        "entity_id",
        "chunk_id",
        "char_start",
        "char_end",
        "confidence",
        "extractor",
        "extractor_version",
    }


class KgClaim(_KgModel):
    table_name: ClassVar[str] = "kg_claim"
    subject_id: Optional[str] = None
    predicate: str
    object_id: Optional[str] = None
    object_literal: Optional[str] = None
    status: str = "active"
    confidence: Optional[float] = None
    project_id: str
    source_id: str
    chunk_id: Optional[str] = None
    extractor: Optional[str] = None
    extractor_version: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None
    nullable_fields: ClassVar[set[str]] = {
        "subject_id",
        "object_id",
        "object_literal",
        "confidence",
        "chunk_id",
        "extractor",
        "extractor_version",
        "valid_from",
        "valid_to",
        "metadata",
    }


class KgRelation(_KgModel):
    table_name: ClassVar[str] = "kg_relation"
    type: str
    from_id: str
    to_id: str
    project_id: str
    source_id: Optional[str] = None
    chunk_id: Optional[str] = None
    confidence: Optional[float] = None
    status: str = "active"
    extractor: Optional[str] = None
    extractor_version: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    nullable_fields: ClassVar[set[str]] = {
        "source_id",
        "chunk_id",
        "confidence",
        "extractor",
        "extractor_version",
        "metadata",
    }


class KgExtractionRun(_KgModel):
    table_name: ClassVar[str] = "kg_extraction_run"
    source_id: str
    project_id: Optional[str] = None
    extractor: str
    extractor_version: Optional[str] = None
    status: str
    content_hash: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    command_id: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    nullable_fields: ClassVar[set[str]] = {
        "project_id",
        "extractor_version",
        "content_hash",
        "stats",
        "error_message",
        "command_id",
        "started_at",
        "finished_at",
    }


class KnowledgeGraphRepository:
    """Idempotent write helpers for the knowledge graph projection."""

    @staticmethod
    async def delete_extractor_projection(
        *,
        source_id: str,
        project_id: str,
        extractor: str,
    ) -> None:
        """Remove prior rows for this source/project/extractor before rewrite."""
        vars = {
            "source_id": ensure_record_id(source_id),
            "project_id": ensure_record_id(project_id),
            "extractor": extractor,
        }
        await repo_query(
            "DELETE kg_mention WHERE source_id = $source_id AND project_id = $project_id AND extractor = $extractor",
            vars,
        )
        await repo_query(
            "DELETE kg_claim WHERE source_id = $source_id AND project_id = $project_id AND extractor = $extractor",
            vars,
        )
        await repo_query(
            "DELETE kg_relation WHERE source_id = $source_id AND project_id = $project_id AND extractor = $extractor",
            vars,
        )
        await repo_query(
            "DELETE kg_entity WHERE source_id = $source_id AND project_id = $project_id AND extractor = $extractor",
            vars,
        )

    @staticmethod
    async def upsert_entity(
        *,
        project_id: str,
        entity_type: str,
        label: str,
        source_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        extractor: Optional[str] = None,
        extractor_version: Optional[str] = None,
    ) -> KgEntity:
        key = normalize_entity_key(label)
        existing = await repo_query(
            """
            SELECT * FROM kg_entity
            WHERE project_id = $project_id
              AND type = $type
              AND normalized_key = $normalized_key
            LIMIT 1
            """,
            {
                "project_id": ensure_record_id(project_id),
                "type": entity_type,
                "normalized_key": key,
            },
        )
        if existing:
            entity = KgEntity(**existing[0])
            meta = dict(entity.metadata or {})
            merged_from = list(meta.get("MERGED_FROM") or [])
            if (
                source_id
                and source_id not in merged_from
                and str(entity.source_id) != source_id
            ):
                merged_from.append(source_id)
                meta["MERGED_FROM"] = merged_from
                entity.metadata = meta
                await entity.save()
            return entity

        entity = KgEntity(
            type=entity_type,
            label=label,
            normalized_key=key,
            project_id=project_id,
            source_id=source_id,
            metadata=metadata or {},
            extractor=extractor,
            extractor_version=extractor_version,
        )
        await entity.save()
        return entity

    @staticmethod
    async def create_mention(**kwargs: Any) -> KgMention:
        mention = KgMention(**kwargs)
        await mention.save()
        return mention

    @staticmethod
    async def create_claim(**kwargs: Any) -> KgClaim:
        claim = KgClaim(**kwargs)
        await claim.save()
        return claim

    @staticmethod
    async def create_relation(**kwargs: Any) -> KgRelation:
        relation = KgRelation(**kwargs)
        await relation.save()
        return relation

    @staticmethod
    async def list_entities_for_project(
        project_id: str,
        *,
        entity_type: Optional[str] = None,
        query: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        clauses = ["project_id = $project_id"]
        vars: Dict[str, Any] = {
            "project_id": ensure_record_id(project_id),
            "limit": limit,
        }
        if entity_type:
            clauses.append("type = $type")
            vars["type"] = entity_type
        if query:
            clauses.append(
                "(string::lowercase(label) CONTAINS string::lowercase($q) OR normalized_key CONTAINS string::lowercase($q))"
            )
            vars["q"] = query
        where = " AND ".join(clauses)
        return await repo_query(
            f"SELECT * FROM kg_entity WHERE {where} ORDER BY label ASC LIMIT $limit",
            vars,
        )

    @staticmethod
    async def list_source_knowledge(source_id: str) -> Dict[str, Any]:
        sid = ensure_record_id(source_id)
        entities = await repo_query(
            "SELECT * FROM kg_entity WHERE source_id = $source_id ORDER BY label ASC",
            {"source_id": sid},
        )
        claims = await repo_query(
            "SELECT * FROM kg_claim WHERE source_id = $source_id ORDER BY created DESC",
            {"source_id": sid},
        )
        relations = await repo_query(
            "SELECT * FROM kg_relation WHERE source_id = $source_id",
            {"source_id": sid},
        )
        runs = await repo_query(
            "SELECT * FROM kg_extraction_run WHERE source_id = $source_id ORDER BY started_at DESC LIMIT 20",
            {"source_id": sid},
        )
        return {
            "entities": entities or [],
            "claims": claims or [],
            "relations": relations or [],
            "runs": runs or [],
        }

    @staticmethod
    async def latest_runs_by_extractor(source_id: str) -> Dict[str, Dict[str, Any]]:
        runs = await repo_query(
            """
            SELECT * FROM kg_extraction_run
            WHERE source_id = $source_id
            ORDER BY started_at DESC
            """,
            {"source_id": ensure_record_id(source_id)},
        )
        latest: Dict[str, Dict[str, Any]] = {}
        for run in runs or []:
            extractor = run.get("extractor")
            if extractor and extractor not in latest:
                latest[extractor] = run
        return latest

    @staticmethod
    async def entity_detail(entity_id: str) -> Dict[str, Any]:
        eid = ensure_record_id(entity_id)
        entity_rows = await repo_query("SELECT * FROM $id", {"id": eid})
        if not entity_rows:
            return {}
        entity = entity_rows[0]
        claims = await repo_query(
            """
            SELECT * FROM kg_claim
            WHERE subject_id = $id OR object_id = $id
            ORDER BY created DESC
            """,
            {"id": eid},
        )
        relations = await repo_query(
            """
            SELECT * FROM kg_relation
            WHERE from_id = $id OR to_id = $id
            """,
            {"id": eid},
        )
        return {
            "entity": entity,
            "claims": claims or [],
            "relations": relations or [],
        }


async def seed_entities_for_query(
    query: str,
    *,
    project_id: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Exact / contains match against entity keys and mention text."""
    q = (query or "").strip()
    if not q:
        return []
    key = normalize_entity_key(q)
    entities = await repo_query(
        """
        SELECT * FROM kg_entity
        WHERE project_id = $project_id
          AND (
            normalized_key = $key
            OR string::lowercase(label) CONTAINS string::lowercase($q)
            OR normalized_key CONTAINS $key
          )
        LIMIT $limit
        """,
        {
            "project_id": ensure_record_id(project_id),
            "key": key,
            "q": q,
            "limit": limit,
        },
    )
    if entities:
        return entities
    mentions = await repo_query(
        """
        SELECT entity_id, text, confidence FROM kg_mention
        WHERE project_id = $project_id
          AND string::lowercase(text) CONTAINS string::lowercase($q)
          AND entity_id != none
        LIMIT $limit
        """,
        {
            "project_id": ensure_record_id(project_id),
            "q": q,
            "limit": limit,
        },
    )
    entity_ids = [m["entity_id"] for m in (mentions or []) if m.get("entity_id")]
    if not entity_ids:
        return []
    return await repo_query(
        "SELECT * FROM kg_entity WHERE id IN $ids LIMIT $limit",
        {"ids": [ensure_record_id(i) for i in entity_ids], "limit": limit},
    )


async def expand_from_seeds(
    seed_entities: List[Dict[str, Any]],
    *,
    project_id: str,
    max_hops: int = 2,
    max_nodes: int = 50,
    min_confidence: float = 0.5,
    limit: int = 10,
) -> Tuple[List[EvidenceItem], List[EvidencePath]]:
    """Bounded traversal from seed entities; return evidence items + paths."""
    if not seed_entities:
        return [], []

    visited: Dict[str, Dict[str, Any]] = {}
    frontier: List[str] = []
    for ent in seed_entities:
        eid = str(ent.get("id"))
        if eid:
            visited[eid] = ent
            frontier.append(eid)

    paths: List[EvidencePath] = []
    hop = 0
    while frontier and hop < max_hops and len(visited) < max_nodes:
        hop += 1
        next_frontier: List[str] = []
        relations = await repo_query(
            """
            SELECT * FROM kg_relation
            WHERE project_id = $project_id
              AND status = "active"
              AND (confidence = none OR confidence >= $min_confidence)
              AND (from_id IN $ids OR to_id IN $ids)
            LIMIT $max_nodes
            """,
            {
                "project_id": ensure_record_id(project_id),
                "ids": [ensure_record_id(i) for i in frontier],
                "min_confidence": min_confidence,
                "max_nodes": max_nodes,
            },
        )
        for rel in relations or []:
            from_id = str(rel.get("from_id"))
            to_id = str(rel.get("to_id"))
            for neighbor in (from_id, to_id):
                if neighbor in visited or len(visited) >= max_nodes:
                    continue
                rows = await repo_query(
                    "SELECT * FROM $id", {"id": ensure_record_id(neighbor)}
                )
                if rows:
                    visited[neighbor] = rows[0]
                    next_frontier.append(neighbor)
                    paths.append(
                        EvidencePath(
                            nodes=[from_id, to_id],
                            edges=[str(rel.get("type") or "RELATED")],
                            description=f"{from_id} --[{rel.get('type')}]--> {to_id}",
                            confidence=float(rel.get("confidence") or 0.0),
                            source_ids=[str(rel["source_id"])]
                            if rel.get("source_id")
                            else [],
                            chunk_ids=[str(rel["chunk_id"])]
                            if rel.get("chunk_id")
                            else [],
                        )
                    )
        frontier = next_frontier

    entity_ids = list(visited.keys())[:max_nodes]
    claims = await repo_query(
        """
        SELECT * FROM kg_claim
        WHERE project_id = $project_id
          AND status = "active"
          AND (subject_id IN $ids OR object_id IN $ids)
          AND (confidence = none OR confidence >= $min_confidence)
        LIMIT $limit
        """,
        {
            "project_id": ensure_record_id(project_id),
            "ids": [ensure_record_id(i) for i in entity_ids],
            "min_confidence": min_confidence,
            "limit": max(limit * 3, 30),
        },
    )

    items: List[EvidenceItem] = []
    seen_chunk_or_source: set[str] = set()
    for claim in claims or []:
        chunk_id = claim.get("chunk_id")
        source_id = claim.get("source_id")
        evidence_key = str(chunk_id or source_id or claim.get("id"))
        if evidence_key in seen_chunk_or_source:
            continue
        seen_chunk_or_source.add(evidence_key)

        content = None
        title = None
        parent_id = str(source_id) if source_id else None
        item_id = str(chunk_id or source_id or claim.get("id"))

        if chunk_id:
            chunk_rows = await repo_query(
                "SELECT id, content, source FROM $id",
                {"id": ensure_record_id(chunk_id)},
            )
            if chunk_rows:
                content = chunk_rows[0].get("content")
                parent_id = str(chunk_rows[0].get("source") or parent_id)
                item_id = str(chunk_rows[0].get("id"))

        if parent_id and not title:
            src_rows = await repo_query(
                "SELECT title FROM $id", {"id": ensure_record_id(parent_id)}
            )
            if src_rows:
                title = src_rows[0].get("title")

        subject = str(claim.get("subject_id") or "")
        obj = str(claim.get("object_id") or claim.get("object_literal") or "")
        paths.append(
            EvidencePath(
                nodes=[n for n in (subject, obj) if n],
                edges=[str(claim.get("predicate") or "CLAIMS")],
                description=(
                    f"{subject} --[{claim.get('predicate')}]--> {obj}"
                    f" (source:{source_id}, chunk:{chunk_id})"
                ),
                confidence=float(claim.get("confidence") or 0.0),
                source_ids=[str(source_id)] if source_id else [],
                chunk_ids=[str(chunk_id)] if chunk_id else [],
            )
        )

        items.append(
            EvidenceItem(
                id=item_id,
                parent_id=parent_id,
                title=title or claim.get("predicate"),
                score=float(claim.get("confidence") or 0.7),
                matches=[content] if content else [],
                content=content,
                source="graph",
                raw={
                    "id": item_id,
                    "parent_id": parent_id,
                    "title": title,
                    "matches": [content] if content else [],
                    "claim_id": str(claim.get("id")),
                    "score": float(claim.get("confidence") or 0.7),
                },
            )
        )
        if len(items) >= limit:
            break

    if len(items) < limit:
        for eid, ent in list(visited.items())[: limit - len(items)]:
            items.append(
                EvidenceItem(
                    id=eid,
                    parent_id=str(ent.get("source_id"))
                    if ent.get("source_id")
                    else None,
                    title=ent.get("label"),
                    score=0.55,
                    matches=[f"{ent.get('type')}: {ent.get('label')}"],
                    source="graph",
                    raw={
                        "id": eid,
                        "title": ent.get("label"),
                        "parent_id": ent.get("source_id"),
                        "matches": [f"{ent.get('type')}: {ent.get('label')}"],
                        "score": 0.55,
                    },
                )
            )

    return items[:limit], paths[:50]
