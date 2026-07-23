"""Query-scoped context assembly for project chat."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from loguru import logger

from construction_os.domain.project import Note
from construction_os.retrieval import retrieve
from construction_os.retrieval.types import EvidenceItem
from construction_os.utils.context_mode import is_note_included, is_source_included
from construction_os.utils.token_utils import token_count

CHAT_CONTEXT_MAX_TOKENS = 12_000
CHAT_RETRIEVE_LIMIT = 10
CHAT_NOTE_AUTO_INCLUDE_MAX = 3
SNIPPET_MAX_CHARS = 1200


def eligible_source_ids(context_config: Optional[dict]) -> Set[str]:
    """Source IDs marked for inclusion (legacy insights mode → full)."""
    sources = (context_config or {}).get("sources") or {}
    eligible: Set[str] = set()
    for source_id, status in sources.items():
        if not is_source_included(status):
            continue
        sid = str(source_id)
        if not sid.startswith("source:"):
            sid = f"source:{sid}"
        eligible.add(sid)
    return eligible


def eligible_note_ids(context_config: Optional[dict]) -> Set[str]:
    """Project artifact IDs marked for full content inclusion.

    Accepts both canonical ``artifacts`` and legacy ``notes`` maps
    (and ``artifact_ids`` / ``note_ids`` lists used by the queue runner).
    """
    cfg = context_config or {}
    notes = cfg.get("notes") or {}
    artifacts = cfg.get("artifacts") or {}
    merged: Dict[str, Any] = {**notes, **artifacts}
    eligible: Set[str] = set()
    for note_id, status in merged.items():
        if not is_note_included(status):
            continue
        nid = str(note_id)
        if not nid.startswith("note:"):
            nid = f"note:{nid}"
        eligible.add(nid)
    return eligible


# Alias for clearer call sites
eligible_artifact_ids = eligible_note_ids


def _normalize_id(value: Optional[str]) -> str:
    return str(value or "").strip()


def _item_in_pool(item: EvidenceItem, source_ids: Set[str], note_ids: Set[str]) -> bool:
    rid = _normalize_id(item.id)
    parent = _normalize_id(item.parent_id)
    if rid.startswith("note:") or parent.startswith("note:"):
        return rid in note_ids or parent in note_ids
    if not source_ids and not note_ids:
        return True
    return rid in source_ids or parent in source_ids


def _snippet_from_item(item: EvidenceItem) -> str:
    if item.matches:
        parts = [str(m) for m in item.matches if m is not None]
        text = "\n".join(parts).strip()
        if text:
            return text[:SNIPPET_MAX_CHARS]
    if item.content is not None:
        return str(item.content)[:SNIPPET_MAX_CHARS]
    raw = item.raw or {}
    for key in ("content", "full_text", "text"):
        if raw.get(key):
            return str(raw[key])[:SNIPPET_MAX_CHARS]
    return ""


def _format_evidence_block(item: EvidenceItem) -> str:
    title = item.title or "Untitled"
    snippet = _snippet_from_item(item)
    lines = [f"- id: {item.id}"]
    if item.parent_id:
        lines.append(f"  parent: {item.parent_id}")
    lines.append(f"  title: {title}")
    if item.chunk_id:
        lines.append(f"  chunk_id: {item.chunk_id}")
    if item.page is not None:
        lines.append(f"  page: {item.page}")
    if item.char_start is not None and item.char_end is not None:
        lines.append(f"  char_offsets: {item.char_start}-{item.char_end}")
    if snippet:
        lines.append(f"  excerpt: {snippet}")
    return "\n".join(lines)


def evidence_focus_from_items(items: Sequence[EvidenceItem]) -> List[Dict[str, Any]]:
    """Build citation deep-link focus entries keyed later by sourceId (first wins)."""
    focus: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for item in items:
        rid = _normalize_id(item.id)
        parent = _normalize_id(item.parent_id)
        source_id = rid if rid.startswith("source:") else parent
        if not source_id.startswith("source:") or source_id in seen:
            continue
        seen.add(source_id)
        entry: Dict[str, Any] = {"sourceId": source_id}
        if item.chunk_id:
            entry["chunkId"] = str(item.chunk_id)
        if item.page is not None:
            entry["page"] = int(item.page)
        if item.char_start is not None:
            entry["charStart"] = int(item.char_start)
        if item.char_end is not None:
            entry["charEnd"] = int(item.char_end)
        excerpt = _snippet_from_item(item)
        if excerpt:
            entry["excerpt"] = excerpt[:500]
        focus.append(entry)
    return focus


def _trim_to_budget(blocks: List[str], max_tokens: int) -> Tuple[str, int]:
    """Join blocks while staying under max_tokens; return text and token count."""
    kept: List[str] = []
    total = 0
    for block in blocks:
        block_tokens = token_count(block) if block else 0
        if kept and total + block_tokens > max_tokens:
            break
        if not kept and block_tokens > max_tokens:
            # Always keep a truncated first block rather than empty context.
            approx_chars = max(200, max_tokens * 3)
            truncated = block[:approx_chars] + "\n…[truncated]"
            return truncated, token_count(truncated)
        kept.append(block)
        total += block_tokens
    text = "\n\n".join(kept).strip()
    return text, token_count(text) if text else 0


async def _load_note_blocks(note_ids: Sequence[str]) -> List[str]:
    blocks: List[str] = []
    for note_id in note_ids:
        try:
            note = await Note.get(note_id)
            if not note:
                continue
            ctx = note.get_context(context_size="long")
            content = str(ctx.get("content") or ctx)
            title = ctx.get("title") or getattr(note, "title", None) or "Artifact"
            blocks.append(
                f"- id: {note.id}\n  title: {title}\n  excerpt: {str(content)[:SNIPPET_MAX_CHARS]}"
            )
        except Exception as e:
            logger.debug(f"Skipping note {note_id} in chat context: {e}")
    return blocks


async def build_relevance_context(
    *,
    query: str,
    project_id: str,
    context_config: Optional[dict],
    max_tokens: int = CHAT_CONTEXT_MAX_TOKENS,
    limit: int = CHAT_RETRIEVE_LIMIT,
) -> Dict[str, Any]:
    """
    Build compact, query-scoped chat context from the UI candidate pool.

    Returns a dict with sources/notes lists (compact strings),
    formatted text, and counts for progress events.
    """
    source_pool = eligible_source_ids(context_config)
    note_pool = eligible_note_ids(context_config)

    empty = {
        "sources": [],
        "notes": [],
        "formatted": None,
        "total_tokens": 0,
        "sourceCount": 0,
        "noteCount": 0,
        "tokenCount": 0,
        "retrievalModeUsed": None,
        "fallbackReason": None,
        "embeddingDimWarning": None,
        "evidenceFocus": [],
    }

    if not source_pool and not note_pool:
        return empty

    search_sources = bool(source_pool)
    search_notes = bool(note_pool)

    retrieval_mode_used: Optional[str] = None
    fallback_reason: Optional[str] = None
    embedding_dim_warning: Optional[str] = None

    try:
        bundle = await retrieve(
            query,
            project_id=project_id,
            mode="auto",
            limit=max(limit * 2, limit),  # over-fetch then filter to pool
            search_sources=search_sources,
            search_notes=search_notes,
            minimum_score=0.15,
        )
        retrieval_mode_used = bundle.retrieval_mode_used
        fallback_reason = bundle.fallback_reason
        embedding_dim_warning = bundle.embedding_dim_warning
    except Exception as e:
        logger.warning(f"Chat retrieve failed, continuing with notes only: {e}")
        bundle = None
        fallback_reason = "retrieve_failed"

    filtered: List[EvidenceItem] = []
    if bundle:
        for item in bundle.items:
            if _item_in_pool(item, source_pool, note_pool):
                filtered.append(item)
            if len(filtered) >= limit:
                break

    source_blocks: List[str] = []
    note_blocks: List[str] = []
    seen_sources: Set[str] = set()
    seen_notes: Set[str] = set()

    for item in filtered:
        rid = _normalize_id(item.id)
        parent = _normalize_id(item.parent_id)
        block = _format_evidence_block(item)
        if rid.startswith("note:") or parent.startswith("note:"):
            note_blocks.append(block)
            seen_notes.add(rid if rid.startswith("note:") else parent)
        else:
            source_blocks.append(block)
            if rid.startswith("source:"):
                seen_sources.add(rid)
            elif parent.startswith("source:"):
                seen_sources.add(parent)

    # Few selected notes: include them under budget even if retrieval missed them.
    if note_pool and len(note_pool) <= CHAT_NOTE_AUTO_INCLUDE_MAX:
        missing = [nid for nid in sorted(note_pool) if nid not in seen_notes]
        if missing:
            note_blocks.extend(await _load_note_blocks(missing))

    sections: List[str] = []
    if source_blocks:
        sections.append("## Sources\n" + "\n\n".join(source_blocks))
    if note_blocks:
        sections.append("## Artifacts\n" + "\n\n".join(note_blocks))

    formatted, tokens = _trim_to_budget(sections, max_tokens)

    id_lines = [
        line for line in (formatted or "").splitlines() if line.strip().startswith("- id:")
    ]
    source_count = sum(1 for line in id_lines if "source:" in line)
    note_count = sum(1 for line in id_lines if "note:" in line)
    # Embedding chunk hits may use non-source ids; count remaining source blocks.
    if source_blocks and source_count == 0 and "## Sources" in (formatted or ""):
        source_count = min(
            len(source_blocks),
            max(1, len(id_lines) - note_count),
        )

    logger.info(
        "chat_relevance_context retrieval_mode_used={} fallback_reason={} "
        "source_count={} note_count={} token_count={}",
        retrieval_mode_used,
        fallback_reason,
        source_count,
        note_count,
        tokens,
    )

    return {
        "sources": source_blocks,
        "notes": note_blocks,
        "formatted": formatted or None,
        "total_tokens": tokens,
        "sourceCount": source_count,
        "noteCount": note_count,
        "tokenCount": tokens,
        "retrievalModeUsed": retrieval_mode_used,
        "fallbackReason": fallback_reason,
        "embeddingDimWarning": embedding_dim_warning,
        "evidenceFocus": evidence_focus_from_items(filtered),
    }


def estimate_preview_tokens(
    *,
    source_pool_size: int,
    note_pool_size: int,
    max_tokens: int = CHAT_CONTEXT_MAX_TOKENS,
) -> int:
    """
    Estimate tokens for the chat footer preview.

    Selections are a search pool; answers inject at most max_tokens.
    Empty pool => 0. Otherwise report a retrieval-sized estimate capped
    at max_tokens (not the full dump of every source).
    """
    if source_pool_size <= 0 and note_pool_size <= 0:
        return 0
    # Rough per-hit cost for top-K snippets (~10 items).
    estimated = min(max_tokens, 800 + (source_pool_size + note_pool_size) * 40)
    return min(estimated, max_tokens)
