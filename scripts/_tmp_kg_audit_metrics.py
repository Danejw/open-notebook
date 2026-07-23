"""Read-only KG audit metrics (do not modify graph data)."""

from __future__ import annotations

import asyncio
import json

from dotenv import load_dotenv

load_dotenv()

from construction_os.database.repository import repo_query
from construction_os.knowledge.backfill import provenance_metrics
from construction_os.retrieval.evidence_retriever import get_graph_rag_mode


def _c(rows):
    if not rows:
        return 0
    return int(rows[0].get("c") or 0)


async def main() -> None:
    m = await provenance_metrics()
    entity_types = await repo_query(
        "SELECT type, count() AS c FROM kg_entity GROUP BY type"
    )
    rel_types = await repo_query(
        'SELECT type, count() AS c FROM kg_relation WHERE status = "active" GROUP BY type'
    )
    runs = await repo_query(
        "SELECT status, count() AS c FROM kg_extraction_run GROUP BY status"
    )
    claim_conf = await repo_query(
        "SELECT count() AS c FROM kg_claim WHERE confidence != NONE GROUP ALL"
    )
    rel_conf = await repo_query(
        'SELECT count() AS c FROM kg_relation WHERE confidence != NONE AND status = "active" GROUP ALL'
    )
    rel_chunk = await repo_query(
        'SELECT count() AS c FROM kg_relation WHERE status = "active" AND chunk_id != NONE GROUP ALL'
    )
    rel_src = await repo_query(
        'SELECT count() AS c FROM kg_relation WHERE status = "active" AND source_id != NONE GROUP ALL'
    )
    mention_chunk = await repo_query(
        "SELECT count() AS c FROM kg_mention WHERE chunk_id != NONE GROUP ALL"
    )
    mention_no_chunk = await repo_query(
        "SELECT count() AS c FROM kg_mention WHERE chunk_id = NONE GROUP ALL"
    )
    qrun = await repo_query("SELECT count() AS c FROM kg_query_run GROUP ALL")
    dup_rows = await repo_query(
        """
        SELECT project_id, type, normalized_key, count() AS c FROM kg_entity
        GROUP BY project_id, type, normalized_key
        """
    )
    dup_keys = [r for r in (dup_rows or []) if int(r.get("c") or 0) > 1][:20]
    orphan_claim = await repo_query(
        """
        SELECT count() AS c FROM kg_claim
        WHERE subject_id NOT IN (SELECT VALUE id FROM kg_entity) GROUP ALL
        """
    )
    orphan_mention = await repo_query(
        """
        SELECT count() AS c FROM kg_mention
        WHERE entity_id != NONE AND entity_id NOT IN (SELECT VALUE id FROM kg_entity)
        GROUP ALL
        """
    )
    self_rel = await repo_query(
        'SELECT count() AS c FROM kg_relation WHERE from_id = to_id AND status = "active" GROUP ALL'
    )
    active_rel = await repo_query(
        'SELECT count() AS c FROM kg_relation WHERE status = "active" GROUP ALL'
    )
    claims = await repo_query("SELECT count() AS c FROM kg_claim GROUP ALL")
    mentions = await repo_query("SELECT count() AS c FROM kg_mention GROUP ALL")
    # Sample fail reasons
    fail_sample = await repo_query(
        """
        SELECT error, extractor, count() AS c FROM kg_extraction_run
        WHERE status = "failed"
        GROUP BY error, extractor
        ORDER BY c DESC
        LIMIT 10
        """
    )
    # Relations without source that are not linker
    non_derived_no_chunk = await repo_query(
        """
        SELECT count() AS c FROM kg_relation
        WHERE status = "active"
          AND chunk_id = NONE
          AND (extractor = NONE OR extractor != "project_linker")
          AND (metadata.derived = NONE OR metadata.derived != true)
        GROUP ALL
        """
    )
    print(
        json.dumps(
            {
                "graph_rag_mode": get_graph_rag_mode(),
                "provenance": m,
                "entity_types": entity_types,
                "rel_types": rel_types,
                "runs": runs,
                "claims_total": _c(claims),
                "mentions_total": _c(mentions),
                "active_rels": _c(active_rel),
                "claims_with_confidence": _c(claim_conf),
                "active_rels_with_confidence": _c(rel_conf),
                "active_rels_with_chunk": _c(rel_chunk),
                "active_rels_with_source": _c(rel_src),
                "mentions_with_chunk": _c(mention_chunk),
                "mentions_without_chunk": _c(mention_no_chunk),
                "kg_query_run": _c(qrun),
                "dup_key_groups_sample": dup_keys,
                "orphan_claim_subjects": _c(orphan_claim),
                "orphan_mention_entities": _c(orphan_mention),
                "self_relations": _c(self_rel),
                "non_derived_active_rels_missing_chunk": _c(non_derived_no_chunk),
                "fail_reason_sample": fail_sample,
            },
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
