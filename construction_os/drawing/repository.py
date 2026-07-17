"""Persistence helpers for architectural drawing extraction tables."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from loguru import logger

from construction_os.database.repository import (
    ensure_record_id,
    repo_create,
    repo_query,
    repo_update,
)
from construction_os.drawing.config import EXTRACTOR_VERSION


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rid(value: Optional[str]) -> Optional[Any]:
    if not value:
        return None
    return ensure_record_id(value)


def _unwrap_record(result: Any) -> Dict[str, Any]:
    """Normalize SurrealDB insert/update results to a single record dict."""
    if isinstance(result, list):
        if not result:
            raise RuntimeError("Database create/update returned an empty result")
        first = result[0]
        if not isinstance(first, dict):
            raise RuntimeError(f"Unexpected database result: {first!r}")
        return first
    if isinstance(result, dict):
        return result
    raise RuntimeError(f"Unexpected database result type: {type(result)!r}")


async def create_run(
    *,
    source_id: str,
    project_id: Optional[str],
    file_hash: str,
    status: str,
    extraction_model: Optional[str],
    verification_model: Optional[str],
    embedding_model: Optional[str],
    force: bool = False,
    command_id: Optional[str] = None,
    output_dir: Optional[str] = None,
) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "source_id": _rid(source_id),
        "project_id": _rid(project_id) if project_id else None,
        "file_hash": file_hash,
        "extractor_version": EXTRACTOR_VERSION,
        "extraction_model": extraction_model,
        "verification_model": verification_model,
        "embedding_model": embedding_model,
        "status": status,
        "active": False,
        "force": force,
        "command_id": _rid(command_id) if command_id else None,
        "started_at": _now(),
        "errors": [],
        "stats": {},
        "output_dir": output_dir,
    }
    return _unwrap_record(await repo_create("drawing_extraction_run", data))


async def update_run(run_id: str, **fields: Any) -> Dict[str, Any]:
    payload = dict(fields)
    for key in ("source_id", "project_id", "command_id"):
        if key in payload and payload[key] is not None:
            payload[key] = _rid(str(payload[key]))
    return _unwrap_record(
        await repo_update("drawing_extraction_run", run_id, payload)
    )


async def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    rows = await repo_query(
        "SELECT * FROM drawing_extraction_run WHERE id = $id LIMIT 1",
        {"id": ensure_record_id(run_id)},
    )
    return rows[0] if rows else None


async def list_runs_for_source(source_id: str) -> List[Dict[str, Any]]:
    rows = await repo_query(
        "SELECT * FROM drawing_extraction_run WHERE source_id = $sid ORDER BY created DESC",
        {"sid": ensure_record_id(source_id)},
    )
    return rows or []


async def list_runs_for_project(project_id: str) -> List[Dict[str, Any]]:
    rows = await repo_query(
        "SELECT * FROM drawing_extraction_run WHERE project_id = $pid ORDER BY created DESC",
        {"pid": ensure_record_id(project_id)},
    )
    return rows or []


async def find_completed_run_by_hash(
    source_id: str, file_hash: str
) -> Optional[Dict[str, Any]]:
    rows = await repo_query(
        """
        SELECT * FROM drawing_extraction_run
        WHERE source_id = $sid AND file_hash = $hash
          AND status IN ['completed', 'partial']
        ORDER BY created DESC LIMIT 1
        """,
        {"sid": ensure_record_id(source_id), "hash": file_hash},
    )
    return rows[0] if rows else None


async def deactivate_runs_for_source(source_id: str) -> None:
    await repo_query(
        "UPDATE drawing_extraction_run SET active = false WHERE source_id = $sid AND active = true",
        {"sid": ensure_record_id(source_id)},
    )


async def activate_run(run_id: str, source_id: str) -> Dict[str, Any]:
    await deactivate_runs_for_source(source_id)
    return await update_run(run_id, active=True)


async def create_page(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["run_id"] = _rid(str(payload["run_id"]))
    payload["source_id"] = _rid(str(payload["source_id"]))
    return _unwrap_record(await repo_create("drawing_page", payload))


async def create_region(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["run_id"] = _rid(str(payload["run_id"]))
    payload["page_id"] = _rid(str(payload["page_id"]))
    return _unwrap_record(await repo_create("drawing_region", payload))


async def create_item(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["run_id"] = _rid(str(payload["run_id"]))
    payload["source_id"] = _rid(str(payload["source_id"]))
    if payload.get("page_id"):
        payload["page_id"] = _rid(str(payload["page_id"]))
    if payload.get("region_id"):
        payload["region_id"] = _rid(str(payload["region_id"]))
    return _unwrap_record(await repo_create("drawing_item", payload))


async def create_relationship(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["run_id"] = _rid(str(payload["run_id"]))
    payload["source_id"] = _rid(str(payload["source_id"]))
    return _unwrap_record(await repo_create("drawing_relationship", payload))


async def create_semantic_record(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["run_id"] = _rid(str(payload["run_id"]))
    payload["source_id"] = _rid(str(payload["source_id"]))
    if payload.get("project_id"):
        payload["project_id"] = _rid(str(payload["project_id"]))
    if payload.get("page_id"):
        payload["page_id"] = _rid(str(payload["page_id"]))
    if payload.get("region_id"):
        payload["region_id"] = _rid(str(payload["region_id"]))
    return _unwrap_record(await repo_create("drawing_semantic_record", payload))


async def create_embedding(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)
    payload["run_id"] = _rid(str(payload["run_id"]))
    payload["source_id"] = _rid(str(payload["source_id"]))
    if payload.get("project_id"):
        payload["project_id"] = _rid(str(payload["project_id"]))
    if payload.get("page_id"):
        payload["page_id"] = _rid(str(payload["page_id"]))
    if payload.get("region_id"):
        payload["region_id"] = _rid(str(payload["region_id"]))
    if payload.get("semantic_record_id"):
        payload["semantic_record_id"] = _rid(str(payload["semantic_record_id"]))
    return _unwrap_record(await repo_create("drawing_embedding", payload))


async def delete_run_children(run_id: str) -> None:
    """Remove page/item projections for a run (used before rebuild of same run)."""
    rid = ensure_record_id(run_id)
    await repo_query("DELETE drawing_embedding WHERE run_id = $rid", {"rid": rid})
    await repo_query(
        "DELETE drawing_semantic_record WHERE run_id = $rid", {"rid": rid}
    )
    await repo_query("DELETE drawing_relationship WHERE run_id = $rid", {"rid": rid})
    await repo_query("DELETE drawing_item WHERE run_id = $rid", {"rid": rid})
    await repo_query("DELETE drawing_region WHERE run_id = $rid", {"rid": rid})
    await repo_query("DELETE drawing_page WHERE run_id = $rid", {"rid": rid})


async def get_run_detail(run_id: str) -> Dict[str, Any]:
    run = await get_run(run_id)
    if not run:
        return {}
    rid = ensure_record_id(run_id)
    pages = await repo_query(
        "SELECT * FROM drawing_page WHERE run_id = $rid ORDER BY page_index ASC",
        {"rid": rid},
    )
    items = await repo_query(
        "SELECT * FROM drawing_item WHERE run_id = $rid",
        {"rid": rid},
    )
    regions = await repo_query(
        "SELECT * FROM drawing_region WHERE run_id = $rid",
        {"rid": rid},
    )
    relationships = await repo_query(
        "SELECT * FROM drawing_relationship WHERE run_id = $rid",
        {"rid": rid},
    )
    semantics = await repo_query(
        "SELECT * FROM drawing_semantic_record WHERE run_id = $rid",
        {"rid": rid},
    )
    return {
        "run": run,
        "pages": pages or [],
        "items": items or [],
        "regions": regions or [],
        "relationships": relationships or [],
        "semantic_records": semantics or [],
    }


async def search_drawing_embeddings(
    *,
    project_id: str,
    query_embedding: List[float],
    limit: int = 10,
    minimum_score: float = 0.15,
) -> List[Dict[str, Any]]:
    """
    Vector search over active-run drawing embeddings.

    Uses cosine similarity in SurrealQL when available; falls back to fetching
    active embeddings and scoring in Python if the DB function is unavailable.
    """
    try:
        rows = await repo_query(
            """
            SELECT *,
              vector::similarity::cosine(embedding, $emb) AS similarity
            FROM drawing_embedding
            WHERE project_id = $pid
              AND run_id.active = true
              AND run_id.status IN ['completed', 'partial']
            ORDER BY similarity DESC
            LIMIT $limit
            """,
            {
                "pid": ensure_record_id(project_id),
                "emb": query_embedding,
                "limit": limit,
            },
        )
        results = []
        for row in rows or []:
            sim = float(row.get("similarity") or 0.0)
            if sim < minimum_score:
                continue
            results.append(row)
        return results
    except Exception as exc:
        logger.debug("Drawing embedding Surreal search fallback: {}", exc)

    # Fallback: load active embeddings for project and score locally
    import math

    rows = await repo_query(
        """
        SELECT * FROM drawing_embedding
        WHERE project_id = $pid
        """,
        {"pid": ensure_record_id(project_id)},
    )
    # Filter to active runs
    active_runs = await repo_query(
        """
        SELECT id FROM drawing_extraction_run
        WHERE project_id = $pid AND active = true
          AND status IN ['completed', 'partial']
        """,
        {"pid": ensure_record_id(project_id)},
    )
    active_ids = {str(r["id"]) for r in (active_runs or [])}

    def cosine(a: List[float], b: List[float]) -> float:
        if not a or not b or len(a) != len(b):
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(y * y for y in b))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)

    scored: List[Dict[str, Any]] = []
    for row in rows or []:
        if str(row.get("run_id")) not in active_ids:
            continue
        emb = row.get("embedding") or []
        sim = cosine(query_embedding, emb)
        if sim < minimum_score:
            continue
        item = dict(row)
        item["similarity"] = sim
        scored.append(item)
    scored.sort(key=lambda r: float(r.get("similarity") or 0), reverse=True)
    return scored[:limit]
