"""Project-scoped knowledge graph projection for visualization.

Maps Surreal `kg_*` / source / chunk records into stable Graph*DTO contracts
so the frontend never depends on raw schema details.
"""

from __future__ import annotations

from collections import defaultdict, deque
from time import perf_counter
from typing import Any, Dict, List, Literal, Optional, Sequence, Set, Tuple

from loguru import logger
from pydantic import BaseModel, Field

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.knowledge_graph import KgCommunity, KgGraphLayout, KgQueryRun

GraphNodeKind = Literal["source", "chunk", "entity", "claim", "community"]

OVERVIEW_NODE_CAP = 450
DEFAULT_NEIGHBOR_LIMIT = 50
MIN_COMMUNITY_SIZE = 3


class GraphNodeDTO(BaseModel):
    id: str
    kind: GraphNodeKind
    label: str
    subtype: Optional[str] = None
    description: Optional[str] = None
    degree: int = 0
    source_count: int = 0
    confidence: Optional[float] = None
    community_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GraphEdgeDTO(BaseModel):
    id: str
    source: str
    target: str
    relation: str
    directed: bool = True
    weight: float = 1.0
    confidence: Optional[float] = None
    evidence_count: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GraphSliceStats(BaseModel):
    total_nodes: int = 0
    total_edges: int = 0
    visible_nodes: int = 0
    visible_edges: int = 0


class GraphSliceDTO(BaseModel):
    nodes: List[GraphNodeDTO] = Field(default_factory=list)
    edges: List[GraphEdgeDTO] = Field(default_factory=list)
    graph_version: str = "0"
    truncated: bool = False
    next_cursor: Optional[str] = None
    stats: GraphSliceStats = Field(default_factory=GraphSliceStats)


class GraphEvidenceDTO(BaseModel):
    chunk_id: Optional[str] = None
    source_id: Optional[str] = None
    source_title: Optional[str] = None
    chunk_order: Optional[int] = None
    snippet: Optional[str] = None
    confidence: Optional[float] = None


class GraphNeighborSummary(BaseModel):
    id: str
    kind: GraphNodeKind
    label: str
    relation: Optional[str] = None


class GraphNodeDetailDTO(GraphNodeDTO):
    aliases: List[str] = Field(default_factory=list)
    evidence: List[GraphEvidenceDTO] = Field(default_factory=list)
    neighbors: List[GraphNeighborSummary] = Field(default_factory=list)
    relation_counts: Dict[str, int] = Field(default_factory=dict)


def _rid(value: Any) -> str:
    return str(value) if value is not None else ""


def _project_matches(row_project: Any, project_id: str) -> bool:
    raw = _rid(row_project)
    return bool(raw) and (project_id in raw or raw in project_id or raw == project_id)


def _table_of(node_id: str) -> str:
    if ":" in node_id:
        return node_id.split(":", 1)[0]
    return ""


def kind_from_id(node_id: str) -> Optional[GraphNodeKind]:
    table = _table_of(node_id)
    mapping = {
        "source": "source",
        "source_embedding": "chunk",
        "kg_entity": "entity",
        "kg_claim": "claim",
        "kg_community": "community",
    }
    return mapping.get(table)  # type: ignore[return-value]


async def get_graph_version(project_id: str) -> int:
    rows = await repo_query(
        "SELECT graph_version FROM $id",
        {"id": ensure_record_id(project_id)},
    )
    if not rows:
        return 0
    return int(rows[0].get("graph_version") or 0)


async def bump_graph_version(project_id: str) -> int:
    rows = await repo_query(
        """
        UPDATE $id SET graph_version = (graph_version OR 0) + 1
        RETURN AFTER
        """,
        {"id": ensure_record_id(project_id)},
    )
    if rows:
        return int(rows[0].get("graph_version") or 0)
    await repo_query(
        "UPDATE $id SET graph_version = 1",
        {"id": ensure_record_id(project_id)},
    )
    return 1


async def _entity_degrees(project_id: str) -> Dict[str, int]:
    rows = await repo_query(
        """
        SELECT from_id AS a, to_id AS b FROM kg_relation
        WHERE project_id = $project_id AND status = "active"
        """,
        {"project_id": ensure_record_id(project_id)},
    )
    degrees: Dict[str, int] = defaultdict(int)
    for row in rows or []:
        a, b = _rid(row.get("a")), _rid(row.get("b"))
        if a:
            degrees[a] += 1
        if b:
            degrees[b] += 1
    claim_rows = await repo_query(
        """
        SELECT subject_id AS a, object_id AS b FROM kg_claim
        WHERE project_id = $project_id
          AND status = "active"
          AND subject_id != none
          AND object_id != none
        """,
        {"project_id": ensure_record_id(project_id)},
    )
    for row in claim_rows or []:
        a, b = _rid(row.get("a")), _rid(row.get("b"))
        if a:
            degrees[a] += 1
        if b:
            degrees[b] += 1
    return degrees


async def _source_counts_for_entities(project_id: str) -> Dict[str, int]:
    """Count distinct sources per entity from mentions (Surreal has no count DISTINCT)."""
    rows = await repo_query(
        """
        SELECT entity_id, source_id FROM kg_mention
        WHERE project_id = $project_id AND entity_id != none AND source_id != none
        """,
        {"project_id": ensure_record_id(project_id)},
    )
    sources_by_entity: Dict[str, Set[str]] = defaultdict(set)
    for row in rows or []:
        eid = _rid(row.get("entity_id"))
        sid = _rid(row.get("source_id"))
        if eid and sid:
            sources_by_entity[eid].add(sid)
    return {eid: len(sids) for eid, sids in sources_by_entity.items()}


def entity_to_node(
    row: Dict[str, Any],
    *,
    degree: int = 0,
    source_count: int = 0,
) -> GraphNodeDTO:
    return GraphNodeDTO(
        id=_rid(row.get("id")),
        kind="entity",
        label=str(row.get("label") or "Untitled"),
        subtype=str(row.get("type") or "") or None,
        description=(row.get("metadata") or {}).get("description")
        if isinstance(row.get("metadata"), dict)
        else None,
        degree=degree,
        source_count=source_count,
        community_id=_rid(row.get("community_id")) or None,
        metadata={
            "normalized_key": row.get("normalized_key"),
            "extractor": row.get("extractor"),
            "source_id": _rid(row.get("source_id")) or None,
            **(row.get("metadata") if isinstance(row.get("metadata"), dict) else {}),
        },
    )


def source_to_node(row: Dict[str, Any], *, degree: int = 0) -> GraphNodeDTO:
    return GraphNodeDTO(
        id=_rid(row.get("id")),
        kind="source",
        label=str(row.get("title") or row.get("asset") or "Source"),
        subtype=str(row.get("asset_type") or row.get("type") or "") or None,
        degree=degree,
        source_count=1,
        metadata={
            "topics": row.get("topics") or [],
        },
    )


def chunk_to_node(row: Dict[str, Any], *, degree: int = 0) -> GraphNodeDTO:
    content = str(row.get("content") or "")
    snippet = content[:160] + ("…" if len(content) > 160 else "")
    return GraphNodeDTO(
        id=_rid(row.get("id")),
        kind="chunk",
        label=f"Chunk {row.get('order', '?')}",
        description=snippet or None,
        degree=degree,
        source_count=1,
        metadata={
            "order": row.get("order"),
            "source_id": _rid(row.get("source")) or None,
        },
    )


def claim_to_node(row: Dict[str, Any]) -> GraphNodeDTO:
    return GraphNodeDTO(
        id=_rid(row.get("id")),
        kind="claim",
        label=str(row.get("predicate") or "claim"),
        subtype="claim",
        confidence=float(row["confidence"]) if row.get("confidence") is not None else None,
        source_count=1 if row.get("source_id") else 0,
        metadata={
            "subject_id": _rid(row.get("subject_id")) or None,
            "object_id": _rid(row.get("object_id")) or None,
            "object_literal": row.get("object_literal"),
            "source_id": _rid(row.get("source_id")) or None,
            "chunk_id": _rid(row.get("chunk_id")) or None,
        },
    )


def community_to_node(row: Dict[str, Any]) -> GraphNodeDTO:
    return GraphNodeDTO(
        id=_rid(row.get("id")),
        kind="community",
        label=str(row.get("label") or "Community"),
        degree=int(row.get("member_count") or 0),
        source_count=0,
        metadata=row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
    )


def relation_to_edge(row: Dict[str, Any]) -> GraphEdgeDTO:
    evidence = 1 if row.get("chunk_id") or row.get("source_id") else 0
    return GraphEdgeDTO(
        id=_rid(row.get("id")),
        source=_rid(row.get("from_id")),
        target=_rid(row.get("to_id")),
        relation=str(row.get("type") or "RELATED"),
        directed=True,
        weight=float(row.get("confidence") or 1.0),
        confidence=float(row["confidence"]) if row.get("confidence") is not None else None,
        evidence_count=evidence,
        metadata={
            "source_id": _rid(row.get("source_id")) or None,
            "chunk_id": _rid(row.get("chunk_id")) or None,
            "kind": "relation",
        },
    )


def claim_to_edge(row: Dict[str, Any]) -> Optional[GraphEdgeDTO]:
    subject = _rid(row.get("subject_id"))
    obj = _rid(row.get("object_id"))
    if not subject or not obj:
        return None
    return GraphEdgeDTO(
        id=_rid(row.get("id")),
        source=subject,
        target=obj,
        relation=str(row.get("predicate") or "CLAIMS"),
        directed=True,
        weight=float(row.get("confidence") or 1.0),
        confidence=float(row["confidence"]) if row.get("confidence") is not None else None,
        evidence_count=1 if row.get("chunk_id") or row.get("source_id") else 0,
        metadata={
            "claim_id": _rid(row.get("id")),
            "source_id": _rid(row.get("source_id")) or None,
            "chunk_id": _rid(row.get("chunk_id")) or None,
            "kind": "claim",
            "object_literal": row.get("object_literal"),
        },
    )


def _belongs_edge(community_id: str, entity_id: str) -> GraphEdgeDTO:
    return GraphEdgeDTO(
        id=f"belongs:{community_id}:{entity_id}",
        source=entity_id,
        target=community_id,
        relation="BELONGS_TO",
        directed=True,
        weight=1.0,
        evidence_count=0,
        metadata={"kind": "belongs_to"},
    )


def _contains_edge(source_id: str, chunk_id: str) -> GraphEdgeDTO:
    return GraphEdgeDTO(
        id=f"contains:{source_id}:{chunk_id}",
        source=source_id,
        target=chunk_id,
        relation="CONTAINS",
        directed=True,
        weight=1.0,
        evidence_count=1,
        metadata={"kind": "contains"},
    )


def _mentions_edge(chunk_id: str, entity_id: str, mention_id: str) -> GraphEdgeDTO:
    return GraphEdgeDTO(
        id=f"mentions:{mention_id}",
        source=chunk_id,
        target=entity_id,
        relation="MENTIONS",
        directed=True,
        weight=1.0,
        evidence_count=1,
        metadata={"kind": "mentions", "mention_id": mention_id},
    )


def _appears_in_edge(entity_id: str, source_id: str) -> GraphEdgeDTO:
    """Synthetic membership edge: entity appears in a source document."""
    return GraphEdgeDTO(
        id=f"appears_in:{entity_id}:{source_id}",
        source=entity_id,
        target=source_id,
        relation="APPEARS_IN",
        directed=True,
        weight=1.0,
        evidence_count=1,
        metadata={"kind": "appears_in"},
    )


def entity_source_ids(entity: Dict[str, Any]) -> List[str]:
    """Collect source IDs from entity.source_id, supporting_sources, and MERGED_FROM."""
    from construction_os.domain.knowledge_graph import supporting_source_ids_from_entity

    return supporting_source_ids_from_entity(entity)


async def recompute_communities(
    project_id: str, *, min_size: int = MIN_COMMUNITY_SIZE
) -> int:
    """Connected-component communities over active relations; persist assignments."""
    rels = await repo_query(
        """
        SELECT from_id, to_id FROM kg_relation
        WHERE project_id = $project_id AND status = "active"
        """,
        {"project_id": ensure_record_id(project_id)},
    )
    graph: Dict[str, Set[str]] = defaultdict(set)
    for row in rels or []:
        a, b = _rid(row.get("from_id")), _rid(row.get("to_id"))
        if a and b and a != b:
            graph[a].add(b)
            graph[b].add(a)

    visited: Set[str] = set()
    components: List[List[str]] = []
    for node in list(graph.keys()):
        if node in visited:
            continue
        stack = [node]
        comp: List[str] = []
        visited.add(node)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for nb in graph[cur]:
                if nb not in visited:
                    visited.add(nb)
                    stack.append(nb)
        if len(comp) >= min_size:
            components.append(comp)

    await repo_query(
        "UPDATE kg_entity SET community_id = NONE WHERE project_id = $project_id",
        {"project_id": ensure_record_id(project_id)},
    )
    await repo_query(
        "DELETE kg_community WHERE project_id = $project_id",
        {"project_id": ensure_record_id(project_id)},
    )

    created = 0
    for idx, members in enumerate(sorted(components, key=len, reverse=True)):
        # Label from highest-degree member within component
        label_entity = members[0]
        label_rows = await repo_query(
            "SELECT label FROM $id", {"id": ensure_record_id(label_entity)}
        )
        label = (
            f"Community: {(label_rows[0].get('label') if label_rows else 'Cluster')}"
            f" (+{len(members) - 1})"
        )
        community = KgCommunity(
            project_id=project_id,
            label=label,
            member_count=len(members),
            metadata={"index": idx, "seed_entity": label_entity},
        )
        await community.save()
        created += 1
        for mid in members:
            await repo_query(
                "UPDATE $id SET community_id = $community_id",
                {
                    "id": ensure_record_id(mid),
                    "community_id": ensure_record_id(community.id),
                },
            )
    logger.info(
        "Recomputed {} communities for project {} (min_size={})",
        created,
        project_id,
        min_size,
    )
    return created


async def after_kg_write(project_id: str) -> int:
    """Bump graph version and refresh communities after extraction."""
    version = await bump_graph_version(project_id)
    try:
        await recompute_communities(project_id)
    except Exception as e:
        logger.warning("Community recompute failed for {}: {}", project_id, e)
    return version


async def project_overview(
    project_id: str,
    *,
    max_nodes: int = OVERVIEW_NODE_CAP,
) -> GraphSliceDTO:
    started = perf_counter()
    version = await get_graph_version(project_id)
    degrees = await _entity_degrees(project_id)
    source_counts = await _source_counts_for_entities(project_id)

    sources = await repo_query(
        """
        SELECT id, title, asset, topics FROM (
            SELECT in AS source FROM reference WHERE out = $project_id FETCH source
        )
        """,
        {"project_id": ensure_record_id(project_id)},
    )
    # Surreal fetch shape may nest under "source"
    source_rows: List[Dict[str, Any]] = []
    for row in sources or []:
        if isinstance(row.get("source"), dict):
            source_rows.append(row["source"])
        elif row.get("id"):
            source_rows.append(row)

    # Fallback if nested query shape differs
    if not source_rows:
        source_rows = await repo_query(
            """
            SELECT id, title, asset, topics FROM source
            WHERE id IN (
                SELECT VALUE in FROM reference WHERE out = $project_id
            )
            """,
            {"project_id": ensure_record_id(project_id)},
        ) or []

    communities = await repo_query(
        "SELECT * FROM kg_community WHERE project_id = $project_id ORDER BY member_count DESC",
        {"project_id": ensure_record_id(project_id)},
    ) or []

    entities = await repo_query(
        "SELECT * FROM kg_entity WHERE project_id = $project_id",
        {"project_id": ensure_record_id(project_id)},
    ) or []
    entities_sorted = sorted(
        entities,
        key=lambda e: degrees.get(_rid(e.get("id")), 0),
        reverse=True,
    )

    nodes: List[GraphNodeDTO] = []
    edges: List[GraphEdgeDTO] = []
    node_ids: Set[str] = set()

    for src in source_rows:
        node = source_to_node(src, degree=0)
        nodes.append(node)
        node_ids.add(node.id)

    for comm in communities:
        node = community_to_node(comm)
        nodes.append(node)
        node_ids.add(node.id)

    entity_budget = max(0, max_nodes - len(nodes))
    truncated = len(entities_sorted) > entity_budget
    visible_entities = entities_sorted[:entity_budget]
    for ent in visible_entities:
        eid = _rid(ent.get("id"))
        node = entity_to_node(
            ent,
            degree=degrees.get(eid, 0),
            source_count=source_counts.get(eid, 1 if ent.get("source_id") else 0),
        )
        nodes.append(node)
        node_ids.add(node.id)
        cid = _rid(ent.get("community_id"))
        if cid and cid in node_ids:
            edges.append(_belongs_edge(cid, eid))
        for sid in entity_source_ids(ent):
            if sid in node_ids:
                edges.append(_appears_in_edge(eid, sid))

    # Relations among visible entities only
    relations = await repo_query(
        """
        SELECT * FROM kg_relation
        WHERE project_id = $project_id AND status = "active"
        """,
        {"project_id": ensure_record_id(project_id)},
    ) or []
    for rel in relations:
        edge = relation_to_edge(rel)
        if edge.source in node_ids and edge.target in node_ids:
            edges.append(edge)

    # High-confidence claims with both subject and object among visible entities
    claims = await repo_query(
        """
        SELECT * FROM kg_claim
        WHERE project_id = $project_id
          AND status = "active"
          AND object_id != none
          AND (confidence = none OR confidence >= 0.5)
        """,
        {"project_id": ensure_record_id(project_id)},
    ) or []
    for claim in claims:
        edge = claim_to_edge(claim)
        if edge and edge.source in node_ids and edge.target in node_ids:
            edges.append(edge)

    total_entities = len(entities)
    total_relations = len(relations)
    elapsed_ms = (perf_counter() - started) * 1000
    if elapsed_ms > 1500:
        logger.warning(
            "Slow graph overview project={} nodes={} edges={} elapsed_ms={:.0f}",
            project_id,
            len(nodes),
            len(edges),
            elapsed_ms,
        )
    else:
        logger.debug(
            "Graph overview project={} nodes={} edges={} elapsed_ms={:.0f}",
            project_id,
            len(nodes),
            len(edges),
            elapsed_ms,
        )
    return GraphSliceDTO(
        nodes=nodes,
        edges=edges,
        graph_version=str(version),
        truncated=truncated,
        stats=GraphSliceStats(
            total_nodes=total_entities + len(source_rows) + len(communities),
            total_edges=total_relations,
            visible_nodes=len(nodes),
            visible_edges=len(edges),
        ),
    )


async def _load_scoped_record(
    node_id: str, project_id: str
) -> Tuple[Optional[Dict[str, Any]], Optional[GraphNodeKind]]:
    kind = kind_from_id(node_id)
    if not kind:
        return None, None
    rows = await repo_query("SELECT * FROM $id", {"id": ensure_record_id(node_id)})
    if not rows:
        return None, kind
    row = rows[0]
    if kind == "entity":
        if not _project_matches(row.get("project_id"), project_id):
            return None, kind
    elif kind == "community":
        if not _project_matches(row.get("project_id"), project_id):
            return None, kind
    elif kind == "claim":
        if not _project_matches(row.get("project_id"), project_id):
            return None, kind
    elif kind == "source":
        linked = await repo_query(
            "SELECT * FROM reference WHERE in = $source_id AND out = $project_id LIMIT 1",
            {
                "source_id": ensure_record_id(node_id),
                "project_id": ensure_record_id(project_id),
            },
        )
        if not linked:
            return None, kind
    elif kind == "chunk":
        source_id = _rid(row.get("source"))
        if not source_id:
            return None, kind
        linked = await repo_query(
            "SELECT * FROM reference WHERE in = $source_id AND out = $project_id LIMIT 1",
            {
                "source_id": ensure_record_id(source_id),
                "project_id": ensure_record_id(project_id),
            },
        )
        if not linked:
            return None, kind
    return row, kind


async def _evidence_for_entity(entity_id: str, project_id: str) -> List[GraphEvidenceDTO]:
    mentions = await repo_query(
        """
        SELECT * FROM kg_mention
        WHERE project_id = $project_id AND entity_id = $entity_id
        LIMIT 40
        """,
        {
            "project_id": ensure_record_id(project_id),
            "entity_id": ensure_record_id(entity_id),
        },
    ) or []
    evidence: List[GraphEvidenceDTO] = []
    for m in mentions:
        chunk_id = _rid(m.get("chunk_id")) or None
        source_id = _rid(m.get("source_id")) or None
        snippet = None
        chunk_order = None
        source_title = None
        if chunk_id:
            chunks = await repo_query(
                "SELECT content, order, source FROM $id",
                {"id": ensure_record_id(chunk_id)},
            )
            if chunks:
                content = str(chunks[0].get("content") or "")
                snippet = content[:240]
                chunk_order = chunks[0].get("order")
                source_id = source_id or _rid(chunks[0].get("source")) or None
        if source_id:
            src = await repo_query(
                "SELECT title FROM $id", {"id": ensure_record_id(source_id)}
            )
            if src:
                source_title = src[0].get("title")
        evidence.append(
            GraphEvidenceDTO(
                chunk_id=chunk_id,
                source_id=source_id,
                source_title=source_title,
                chunk_order=chunk_order,
                snippet=snippet or str(m.get("text") or "")[:240],
                confidence=float(m["confidence"]) if m.get("confidence") is not None else None,
            )
        )
    return evidence


async def get_node_detail(node_id: str, project_id: str) -> Optional[GraphNodeDetailDTO]:
    row, kind = await _load_scoped_record(node_id, project_id)
    if not row or not kind:
        return None

    degrees = await _entity_degrees(project_id) if kind == "entity" else {}
    source_counts = (
        await _source_counts_for_entities(project_id) if kind == "entity" else {}
    )

    base: GraphNodeDTO
    if kind == "entity":
        base = entity_to_node(
            row,
            degree=degrees.get(_rid(row.get("id")), 0),
            source_count=source_counts.get(_rid(row.get("id")), 0),
        )
    elif kind == "source":
        base = source_to_node(row)
    elif kind == "chunk":
        base = chunk_to_node(row)
    elif kind == "claim":
        base = claim_to_node(row)
    else:
        base = community_to_node(row)

    aliases: List[str] = []
    evidence: List[GraphEvidenceDTO] = []
    neighbors: List[GraphNeighborSummary] = []
    relation_counts: Dict[str, int] = defaultdict(int)

    if kind == "entity":
        meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        aliases = list(meta.get("aliases") or [])
        evidence = await _evidence_for_entity(node_id, project_id)
        rels = await repo_query(
            """
            SELECT * FROM kg_relation
            WHERE project_id = $project_id
              AND status = "active"
              AND (from_id = $id OR to_id = $id)
            LIMIT 100
            """,
            {
                "project_id": ensure_record_id(project_id),
                "id": ensure_record_id(node_id),
            },
        ) or []
        for rel in rels:
            relation_counts[str(rel.get("type") or "RELATED")] += 1
            other = (
                _rid(rel.get("to_id"))
                if _rid(rel.get("from_id")) == _rid(node_id)
                else _rid(rel.get("from_id"))
            )
            other_rows = await repo_query(
                "SELECT id, label, type FROM $id", {"id": ensure_record_id(other)}
            )
            if other_rows:
                neighbors.append(
                    GraphNeighborSummary(
                        id=_rid(other_rows[0].get("id")),
                        kind="entity",
                        label=str(other_rows[0].get("label") or other),
                        relation=str(rel.get("type") or "RELATED"),
                    )
                )
        for sid in entity_source_ids(row):
            relation_counts["APPEARS_IN"] = relation_counts.get("APPEARS_IN", 0) + 1
            src_rows = await repo_query(
                "SELECT id, title FROM $id", {"id": ensure_record_id(sid)}
            )
            if src_rows:
                neighbors.append(
                    GraphNeighborSummary(
                        id=sid,
                        kind="source",
                        label=str(src_rows[0].get("title") or sid),
                        relation="APPEARS_IN",
                    )
                )

    return GraphNodeDetailDTO(
        **base.model_dump(),
        aliases=aliases,
        evidence=evidence,
        neighbors=neighbors[:40],
        relation_counts=dict(relation_counts),
    )


async def get_neighbors(
    node_id: str,
    project_id: str,
    *,
    depth: int = 1,
    relation_types: Optional[Sequence[str]] = None,
    node_kinds: Optional[Sequence[str]] = None,
    min_confidence: float = 0.0,
    limit: int = DEFAULT_NEIGHBOR_LIMIT,
) -> GraphSliceDTO:
    version = await get_graph_version(project_id)
    row, kind = await _load_scoped_record(node_id, project_id)
    if not row or not kind:
        return GraphSliceDTO(graph_version=str(version), truncated=False)

    allowed_kinds = set(node_kinds or ["entity", "community", "source"])
    depth = max(1, min(depth, 3))
    limit = max(1, min(limit, 200))

    nodes: Dict[str, GraphNodeDTO] = {}
    edges: Dict[str, GraphEdgeDTO] = {}
    degrees = await _entity_degrees(project_id)
    source_counts = await _source_counts_for_entities(project_id)

    def add_entity(ent: Dict[str, Any]) -> None:
        eid = _rid(ent.get("id"))
        if not eid or eid in nodes:
            return
        if "entity" not in allowed_kinds:
            return
        nodes[eid] = entity_to_node(
            ent,
            degree=degrees.get(eid, 0),
            source_count=source_counts.get(eid, 0),
        )

    if kind == "entity":
        add_entity(row)
    elif kind == "source" and "source" in allowed_kinds:
        nodes[_rid(row.get("id"))] = source_to_node(row)
    elif kind == "community" and "community" in allowed_kinds:
        nodes[_rid(row.get("id"))] = community_to_node(row)
    elif kind == "chunk" and "chunk" in allowed_kinds:
        nodes[_rid(row.get("id"))] = chunk_to_node(row)
    elif kind == "claim" and "claim" in allowed_kinds:
        nodes[_rid(row.get("id"))] = claim_to_node(row)

    frontier = [_rid(node_id)]
    seen = {_rid(node_id)}
    truncated = False

    for _hop in range(depth):
        if len(nodes) >= limit:
            truncated = True
            break
        next_frontier: List[str] = []
        rel_filter = ""
        vars: Dict[str, Any] = {
            "project_id": ensure_record_id(project_id),
            "ids": [ensure_record_id(i) for i in frontier],
            "min_confidence": min_confidence,
        }
        if relation_types:
            rel_filter = " AND type IN $relation_types"
            vars["relation_types"] = list(relation_types)

        relations = await repo_query(
            f"""
            SELECT * FROM kg_relation
            WHERE project_id = $project_id
              AND status = "active"
              AND (confidence = none OR confidence >= $min_confidence)
              AND (from_id IN $ids OR to_id IN $ids)
              {rel_filter}
            LIMIT $cap
            """,
            {**vars, "cap": limit * 3},
        ) or []

        for rel in relations:
            edge = relation_to_edge(rel)
            edges[edge.id] = edge
            for other in (edge.source, edge.target):
                if other in seen:
                    continue
                seen.add(other)
                ent_rows = await repo_query(
                    "SELECT * FROM $id", {"id": ensure_record_id(other)}
                )
                if not ent_rows:
                    continue
                if not _project_matches(ent_rows[0].get("project_id"), project_id):
                    continue
                add_entity(ent_rows[0])
                next_frontier.append(other)
                if len(nodes) >= limit:
                    truncated = True
                    break
            if truncated:
                break

        # Provenance: mentions / chunks when requested
        if "chunk" in allowed_kinds or "claim" in allowed_kinds:
            for fid in frontier:
                if kind_from_id(fid) != "entity":
                    continue
                if "chunk" in allowed_kinds:
                    mentions = await repo_query(
                        """
                        SELECT * FROM kg_mention
                        WHERE project_id = $project_id AND entity_id = $eid
                        LIMIT 20
                        """,
                        {
                            "project_id": ensure_record_id(project_id),
                            "eid": ensure_record_id(fid),
                        },
                    ) or []
                    for m in mentions:
                        chunk_id = _rid(m.get("chunk_id"))
                        if not chunk_id:
                            continue
                        chunks = await repo_query(
                            "SELECT * FROM $id", {"id": ensure_record_id(chunk_id)}
                        )
                        if chunks and chunk_id not in nodes:
                            nodes[chunk_id] = chunk_to_node(chunks[0])
                            edges[_mentions_edge(chunk_id, fid, _rid(m.get("id"))).id] = (
                                _mentions_edge(chunk_id, fid, _rid(m.get("id")))
                            )
                            source_id = _rid(chunks[0].get("source"))
                            if source_id and "source" in allowed_kinds and source_id not in nodes:
                                src = await repo_query(
                                    "SELECT * FROM $id",
                                    {"id": ensure_record_id(source_id)},
                                )
                                if src:
                                    nodes[source_id] = source_to_node(src[0])
                                    edges[_contains_edge(source_id, chunk_id).id] = (
                                        _contains_edge(source_id, chunk_id)
                                    )
                if "claim" in allowed_kinds:
                    claims = await repo_query(
                        """
                        SELECT * FROM kg_claim
                        WHERE project_id = $project_id
                          AND status = "active"
                          AND (subject_id = $eid OR object_id = $eid)
                          AND (confidence = none OR confidence >= $min_confidence)
                        LIMIT 20
                        """,
                        {
                            "project_id": ensure_record_id(project_id),
                            "eid": ensure_record_id(fid),
                            "min_confidence": min_confidence,
                        },
                    ) or []
                    for claim in claims:
                        cid = _rid(claim.get("id"))
                        if cid and cid not in nodes:
                            nodes[cid] = claim_to_node(claim)
                        edge = claim_to_edge(claim)
                        if edge:
                            edges[edge.id] = edge

        # Membership: entity APPEARS_IN source (and reverse when expanding from source)
        if "source" in allowed_kinds:
            for fid in list(frontier):
                if kind_from_id(fid) != "entity":
                    continue
                ent_rows = await repo_query(
                    "SELECT * FROM $id", {"id": ensure_record_id(fid)}
                )
                if not ent_rows:
                    continue
                for sid in entity_source_ids(ent_rows[0]):
                    if sid not in nodes:
                        src = await repo_query(
                            "SELECT * FROM $id", {"id": ensure_record_id(sid)}
                        )
                        if src:
                            nodes[sid] = source_to_node(src[0])
                    if sid in nodes or sid in seen:
                        edges[_appears_in_edge(fid, sid).id] = _appears_in_edge(
                            fid, sid
                        )
                        if sid not in seen:
                            seen.add(sid)
                            next_frontier.append(sid)

        if kind == "source" or any(kind_from_id(f) == "source" for f in frontier):
            for fid in list(frontier):
                if kind_from_id(fid) != "source" or "entity" not in allowed_kinds:
                    continue
                ents = await repo_query(
                    """
                    SELECT * FROM kg_entity
                    WHERE project_id = $project_id AND source_id = $source_id
                    LIMIT $cap
                    """,
                    {
                        "project_id": ensure_record_id(project_id),
                        "source_id": ensure_record_id(fid),
                        "cap": limit,
                    },
                ) or []
                seen_ent: Set[str] = {_rid(e.get("id")) for e in ents if e.get("id")}
                # Mentions for this source
                mentioned = await repo_query(
                    """
                    SELECT VALUE entity_id FROM kg_mention
                    WHERE project_id = $project_id AND source_id = $source_id
                    LIMIT $cap
                    """,
                    {
                        "project_id": ensure_record_id(project_id),
                        "source_id": ensure_record_id(fid),
                        "cap": limit,
                    },
                ) or []
                for mid in mentioned:
                    mid_s = _rid(mid)
                    if mid_s and mid_s not in seen_ent:
                        extra = await repo_query(
                            "SELECT * FROM $id", {"id": ensure_record_id(mid_s)}
                        )
                        if extra:
                            ents.append(extra[0])
                            seen_ent.add(mid_s)
                # MERGED_FROM membership
                merged = await repo_query(
                    """
                    SELECT * FROM kg_entity
                    WHERE project_id = $project_id
                    LIMIT 500
                    """,
                    {"project_id": ensure_record_id(project_id)},
                ) or []
                for ent in merged:
                    eid = _rid(ent.get("id"))
                    if eid and eid not in seen_ent and fid in entity_source_ids(ent):
                        ents.append(ent)
                        seen_ent.add(eid)
                for ent in ents:
                    eid = _rid(ent.get("id"))
                    if not eid or eid in seen:
                        continue
                    add_entity(ent)
                    edges[_appears_in_edge(eid, fid).id] = _appears_in_edge(eid, fid)
                    seen.add(eid)
                    next_frontier.append(eid)
                    if len(nodes) >= limit:
                        truncated = True
                        break

        frontier = next_frontier
        if not frontier:
            break

    visible_nodes = list(nodes.values())[:limit]
    visible_ids = {n.id for n in visible_nodes}
    visible_edges = [
        e for e in edges.values() if e.source in visible_ids and e.target in visible_ids
    ]
    return GraphSliceDTO(
        nodes=visible_nodes,
        edges=visible_edges,
        graph_version=str(version),
        truncated=truncated or len(nodes) > limit,
        stats=GraphSliceStats(
            total_nodes=len(nodes),
            total_edges=len(edges),
            visible_nodes=len(visible_nodes),
            visible_edges=len(visible_edges),
        ),
    )


async def search_graph_nodes(
    project_id: str,
    q: str,
    *,
    limit: int = 30,
) -> GraphSliceDTO:
    version = await get_graph_version(project_id)
    q = (q or "").strip()
    if not q:
        return GraphSliceDTO(graph_version=str(version))

    degrees = await _entity_degrees(project_id)
    source_counts = await _source_counts_for_entities(project_id)
    entities = await repo_query(
        """
        SELECT * FROM kg_entity
        WHERE project_id = $project_id
          AND (
            string::lowercase(label) CONTAINS string::lowercase($q)
            OR normalized_key CONTAINS string::lowercase($q)
          )
        LIMIT $limit
        """,
        {
            "project_id": ensure_record_id(project_id),
            "q": q,
            "limit": limit,
        },
    ) or []
    communities = await repo_query(
        """
        SELECT * FROM kg_community
        WHERE project_id = $project_id
          AND string::lowercase(label) CONTAINS string::lowercase($q)
        LIMIT 10
        """,
        {"project_id": ensure_record_id(project_id), "q": q},
    ) or []

    nodes = [
        entity_to_node(
            e,
            degree=degrees.get(_rid(e.get("id")), 0),
            source_count=source_counts.get(_rid(e.get("id")), 0),
        )
        for e in entities
    ]
    nodes.extend(community_to_node(c) for c in communities)
    return GraphSliceDTO(
        nodes=nodes,
        edges=[],
        graph_version=str(version),
        truncated=False,
        stats=GraphSliceStats(
            total_nodes=len(nodes),
            total_edges=0,
            visible_nodes=len(nodes),
            visible_edges=0,
        ),
    )


async def find_paths(
    project_id: str,
    from_id: str,
    to_id: str,
    *,
    max_depth: int = 4,
) -> GraphSliceDTO:
    version = await get_graph_version(project_id)
    start_row, start_kind = await _load_scoped_record(from_id, project_id)
    end_row, end_kind = await _load_scoped_record(to_id, project_id)
    if not start_row or not end_row or start_kind != "entity" or end_kind != "entity":
        return GraphSliceDTO(graph_version=str(version))

    # BFS on undirected relation graph
    relations = await repo_query(
        """
        SELECT * FROM kg_relation
        WHERE project_id = $project_id AND status = "active"
        """,
        {"project_id": ensure_record_id(project_id)},
    ) or []
    adj: Dict[str, List[Tuple[str, Dict[str, Any]]]] = defaultdict(list)
    for rel in relations:
        a, b = _rid(rel.get("from_id")), _rid(rel.get("to_id"))
        if a and b:
            adj[a].append((b, rel))
            adj[b].append((a, rel))

    parent: Dict[str, Tuple[Optional[str], Optional[Dict[str, Any]]]] = {
        from_id: (None, None)
    }
    queue: deque[str] = deque([from_id])
    found = False
    while queue:
        cur = queue.popleft()
        if cur == to_id:
            found = True
            break
        depth_here = 0
        walk = cur
        while parent[walk][0] is not None:
            depth_here += 1
            walk = parent[walk][0]  # type: ignore[assignment]
            if depth_here > max_depth:
                break
        if depth_here >= max_depth:
            continue
        for nb, rel in adj.get(cur, []):
            if nb not in parent:
                parent[nb] = (cur, rel)
                queue.append(nb)

    if not found and to_id not in parent:
        return GraphSliceDTO(
            nodes=[entity_to_node(start_row), entity_to_node(end_row)],
            edges=[],
            graph_version=str(version),
            truncated=False,
            stats=GraphSliceStats(total_nodes=2, visible_nodes=2),
        )

    # Reconstruct path
    path_nodes = [to_id]
    path_edges: List[Dict[str, Any]] = []
    cur = to_id
    while parent[cur][0] is not None:
        prev, rel = parent[cur]
        if rel:
            path_edges.append(rel)
        path_nodes.append(prev)  # type: ignore[arg-type]
        cur = prev  # type: ignore[assignment]
    path_nodes.reverse()
    path_edges.reverse()

    degrees = await _entity_degrees(project_id)
    nodes: List[GraphNodeDTO] = []
    for nid in path_nodes:
        rows = await repo_query("SELECT * FROM $id", {"id": ensure_record_id(nid)})
        if rows:
            nodes.append(
                entity_to_node(rows[0], degree=degrees.get(nid, 0))
            )
    edges = [relation_to_edge(r) for r in path_edges]
    return GraphSliceDTO(
        nodes=nodes,
        edges=edges,
        graph_version=str(version),
        truncated=False,
        stats=GraphSliceStats(
            total_nodes=len(nodes),
            total_edges=len(edges),
            visible_nodes=len(nodes),
            visible_edges=len(edges),
        ),
    )


async def source_subgraph(source_id: str, project_id: str) -> GraphSliceDTO:
    version = await get_graph_version(project_id)
    linked = await repo_query(
        "SELECT * FROM reference WHERE in = $source_id AND out = $project_id LIMIT 1",
        {
            "source_id": ensure_record_id(source_id),
            "project_id": ensure_record_id(project_id),
        },
    )
    if not linked:
        return GraphSliceDTO(graph_version=str(version))

    src_rows = await repo_query(
        "SELECT * FROM $id", {"id": ensure_record_id(source_id)}
    )
    if not src_rows:
        return GraphSliceDTO(graph_version=str(version))

    nodes: Dict[str, GraphNodeDTO] = {
        _rid(src_rows[0].get("id")): source_to_node(src_rows[0])
    }
    edges: Dict[str, GraphEdgeDTO] = {}

    chunks = await repo_query(
        """
        SELECT id, content, order, source FROM source_embedding
        WHERE source = $source_id
        ORDER BY order ASC
        LIMIT 200
        """,
        {"source_id": ensure_record_id(source_id)},
    ) or []
    for chunk in chunks:
        cid = _rid(chunk.get("id"))
        nodes[cid] = chunk_to_node(chunk)
        edges[_contains_edge(source_id, cid).id] = _contains_edge(source_id, cid)

    mentions = await repo_query(
        """
        SELECT * FROM kg_mention
        WHERE project_id = $project_id AND source_id = $source_id
        """,
        {
            "project_id": ensure_record_id(project_id),
            "source_id": ensure_record_id(source_id),
        },
    ) or []
    entity_ids: Set[str] = set()
    for m in mentions:
        eid = _rid(m.get("entity_id"))
        chunk_id = _rid(m.get("chunk_id"))
        if eid:
            entity_ids.add(eid)
            if chunk_id:
                edges[_mentions_edge(chunk_id, eid, _rid(m.get("id"))).id] = (
                    _mentions_edge(chunk_id, eid, _rid(m.get("id")))
                )

    claims = await repo_query(
        """
        SELECT * FROM kg_claim
        WHERE project_id = $project_id AND source_id = $source_id
        """,
        {
            "project_id": ensure_record_id(project_id),
            "source_id": ensure_record_id(source_id),
        },
    ) or []
    for claim in claims:
        if claim.get("subject_id"):
            entity_ids.add(_rid(claim.get("subject_id")))
        if claim.get("object_id"):
            entity_ids.add(_rid(claim.get("object_id")))
        cid = _rid(claim.get("id"))
        nodes[cid] = claim_to_node(claim)
        edge = claim_to_edge(claim)
        if edge:
            edges[edge.id] = edge

    relations = await repo_query(
        """
        SELECT * FROM kg_relation
        WHERE project_id = $project_id AND source_id = $source_id AND status = "active"
        """,
        {
            "project_id": ensure_record_id(project_id),
            "source_id": ensure_record_id(source_id),
        },
    ) or []
    for rel in relations:
        entity_ids.add(_rid(rel.get("from_id")))
        entity_ids.add(_rid(rel.get("to_id")))
        edge = relation_to_edge(rel)
        edges[edge.id] = edge

    degrees = await _entity_degrees(project_id)
    sid = _rid(source_id)
    for eid in entity_ids:
        if not eid:
            continue
        rows = await repo_query("SELECT * FROM $id", {"id": ensure_record_id(eid)})
        if rows and _project_matches(rows[0].get("project_id"), project_id):
            nodes[eid] = entity_to_node(
                rows[0], degree=degrees.get(eid, 0), source_count=1
            )
            edges[_appears_in_edge(eid, sid).id] = _appears_in_edge(eid, sid)

    # Entities owned by this source even without mentions
    owned = await repo_query(
        """
        SELECT * FROM kg_entity
        WHERE project_id = $project_id AND source_id = $source_id
        """,
        {
            "project_id": ensure_record_id(project_id),
            "source_id": ensure_record_id(source_id),
        },
    ) or []
    all_project_ents = await repo_query(
        "SELECT * FROM kg_entity WHERE project_id = $project_id LIMIT 500",
        {"project_id": ensure_record_id(project_id)},
    ) or []
    for ent in all_project_ents:
        if sid in entity_source_ids(ent):
            owned.append(ent)
    for ent in owned:
        eid = _rid(ent.get("id"))
        if not eid:
            continue
        if eid not in nodes:
            nodes[eid] = entity_to_node(
                ent, degree=degrees.get(eid, 0), source_count=1
            )
        edges[_appears_in_edge(eid, sid).id] = _appears_in_edge(eid, sid)

    return GraphSliceDTO(
        nodes=list(nodes.values()),
        edges=list(edges.values()),
        graph_version=str(version),
        truncated=len(chunks) >= 200,
        stats=GraphSliceStats(
            total_nodes=len(nodes),
            total_edges=len(edges),
            visible_nodes=len(nodes),
            visible_edges=len(edges),
        ),
    )


async def get_layout(
    project_id: str, *, graph_version: Optional[int] = None
) -> Optional[Dict[str, Any]]:
    version = graph_version if graph_version is not None else await get_graph_version(
        project_id
    )
    rows = await repo_query(
        """
        SELECT * FROM kg_graph_layout
        WHERE project_id = $project_id AND graph_version = $graph_version
        LIMIT 1
        """,
        {
            "project_id": ensure_record_id(project_id),
            "graph_version": version,
        },
    )
    return rows[0] if rows else None


async def save_layout(
    project_id: str,
    *,
    positions: Dict[str, Any],
    algorithm: str = "forceatlas2",
    graph_version: Optional[int] = None,
) -> Dict[str, Any]:
    version = graph_version if graph_version is not None else await get_graph_version(
        project_id
    )
    existing = await get_layout(project_id, graph_version=version)
    if existing:
        await repo_query(
            """
            UPDATE $id SET positions = $positions, algorithm = $algorithm, updated = time::now()
            """,
            {
                "id": ensure_record_id(existing["id"]),
                "positions": positions,
                "algorithm": algorithm,
            },
        )
        return {
            "id": _rid(existing["id"]),
            "project_id": project_id,
            "graph_version": version,
            "positions": positions,
            "algorithm": algorithm,
        }
    layout = KgGraphLayout(
        project_id=project_id,
        graph_version=version,
        positions=positions,
        algorithm=algorithm,
    )
    await layout.save()
    return {
        "id": str(layout.id),
        "project_id": project_id,
        "graph_version": version,
        "positions": positions,
        "algorithm": algorithm,
    }


async def persist_query_run(
    *,
    project_id: str,
    query: str,
    retrieval_mode: Optional[str],
    seeds: Optional[Dict[str, Any]],
    paths: Optional[List[Any]],
    cited_ids: Optional[Dict[str, Any]],
    metadata: Optional[Dict[str, Any]] = None,
) -> KgQueryRun:
    run = KgQueryRun(
        project_id=project_id,
        query=query,
        retrieval_mode=retrieval_mode,
        seeds=seeds or {},
        paths=paths or [],
        cited_ids=cited_ids or {},
        status="completed",
        metadata=metadata or {},
    )
    await run.save()
    return run


async def get_query_run_slice(run_id: str) -> Optional[Tuple[KgQueryRun, GraphSliceDTO]]:
    rows = await repo_query("SELECT * FROM $id", {"id": ensure_record_id(run_id)})
    if not rows:
        return None
    run = KgQueryRun(**rows[0])
    project_id = _rid(run.project_id)
    version = await get_graph_version(project_id)

    seed_chunk_ids = list((run.seeds or {}).get("chunk_ids") or [])
    seed_entity_ids = list((run.seeds or {}).get("entity_ids") or [])
    cited_source_ids = list((run.cited_ids or {}).get("source_ids") or [])
    cited_chunk_ids = list((run.cited_ids or {}).get("chunk_ids") or [])
    traversed_relation_ids = list((run.cited_ids or {}).get("relation_ids") or [])

    nodes: Dict[str, GraphNodeDTO] = {}
    edges: Dict[str, GraphEdgeDTO] = {}

    for eid in seed_entity_ids:
        detail_rows = await repo_query(
            "SELECT * FROM $id", {"id": ensure_record_id(eid)}
        )
        if detail_rows and _project_matches(detail_rows[0].get("project_id"), project_id):
            node = entity_to_node(detail_rows[0])
            node.metadata["trace_role"] = "seed_entity"
            nodes[node.id] = node

    for cid in seed_chunk_ids + cited_chunk_ids:
        detail_rows = await repo_query(
            "SELECT * FROM $id", {"id": ensure_record_id(cid)}
        )
        if detail_rows:
            node = chunk_to_node(detail_rows[0])
            node.metadata["trace_role"] = (
                "seed_chunk" if cid in seed_chunk_ids else "evidence"
            )
            nodes[node.id] = node

    for sid in cited_source_ids:
        detail_rows = await repo_query(
            "SELECT * FROM $id", {"id": ensure_record_id(sid)}
        )
        if detail_rows:
            node = source_to_node(detail_rows[0])
            node.metadata["trace_role"] = "cited_source"
            nodes[node.id] = node

    for rid in traversed_relation_ids:
        detail_rows = await repo_query(
            "SELECT * FROM $id", {"id": ensure_record_id(rid)}
        )
        if detail_rows and _project_matches(detail_rows[0].get("project_id"), project_id):
            edge = relation_to_edge(detail_rows[0])
            edge.metadata["trace_role"] = "traversed"
            edges[edge.id] = edge
            for nid in (edge.source, edge.target):
                if nid not in nodes:
                    er = await repo_query(
                        "SELECT * FROM $id", {"id": ensure_record_id(nid)}
                    )
                    if er:
                        n = entity_to_node(er[0])
                        n.metadata["trace_role"] = "expanded_entity"
                        nodes[n.id] = n

    # Also materialize path descriptions as soft edges if relation ids missing
    for path in run.paths or []:
        if not isinstance(path, dict):
            continue
        path_nodes = path.get("nodes") or []
        path_edges = path.get("edges") or []
        for i, nid in enumerate(path_nodes):
            nid_s = _rid(nid)
            if nid_s and nid_s not in nodes and kind_from_id(nid_s) == "entity":
                er = await repo_query(
                    "SELECT * FROM $id", {"id": ensure_record_id(nid_s)}
                )
                if er and _project_matches(er[0].get("project_id"), project_id):
                    n = entity_to_node(er[0])
                    n.metadata["trace_role"] = n.metadata.get("trace_role") or "path_entity"
                    nodes[n.id] = n
            if i + 1 < len(path_nodes) and i < len(path_edges):
                a, b = _rid(path_nodes[i]), _rid(path_nodes[i + 1])
                rel = str(path_edges[i])
                eid = f"trace:{a}:{rel}:{b}"
                if a and b and eid not in edges:
                    edges[eid] = GraphEdgeDTO(
                        id=eid,
                        source=a,
                        target=b,
                        relation=rel,
                        directed=True,
                        weight=float(path.get("confidence") or 1.0),
                        evidence_count=len(path.get("chunk_ids") or []),
                        metadata={"trace_role": "traversed", "kind": "path"},
                    )

    slice_dto = GraphSliceDTO(
        nodes=list(nodes.values()),
        edges=list(edges.values()),
        graph_version=str(version),
        truncated=False,
        stats=GraphSliceStats(
            total_nodes=len(nodes),
            total_edges=len(edges),
            visible_nodes=len(nodes),
            visible_edges=len(edges),
        ),
    )
    return run, slice_dto
