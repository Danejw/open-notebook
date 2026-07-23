"""Read-only duplicate / fail sampling for KG audit."""

from __future__ import annotations

import asyncio
import json

from dotenv import load_dotenv

load_dotenv()

from construction_os.database.repository import repo_query


def _c(rows):
    if not rows:
        return 0
    return int(rows[0].get("c") or 0)


async def main() -> None:
    rows = await repo_query(
        "SELECT project_id, type, normalized_key, count() AS c FROM kg_entity "
        "GROUP BY project_id, type, normalized_key"
    )
    dups = [r for r in (rows or []) if int(r.get("c") or 0) > 1]
    by_type: dict[str, int] = {}
    for r in dups:
        t = str(r.get("type") or "?")
        by_type[t] = by_type.get(t, 0) + 1

    sample = await repo_query(
        """
        SELECT id, type, label, normalized_key, source_id,
               metadata.supporting_sources AS ss, extractor
        FROM kg_entity
        WHERE type = "Reference" AND normalized_key = "03 30 00"
        LIMIT 5
        """
    )
    fail = await repo_query(
        """
        SELECT id, extractor, status, error_message, error_type, stats
        FROM kg_extraction_run WHERE status = "failed" LIMIT 5
        """
    )
    m1 = await repo_query(
        """
        SELECT count() AS c FROM kg_mention
        WHERE (char_start = NONE OR char_end = NONE) AND chunk_id != NONE
        GROUP ALL
        """
    )
    m2 = await repo_query(
        """
        SELECT count() AS c FROM kg_mention
        WHERE (char_start = NONE OR char_end = NONE) AND chunk_id = NONE
        GROUP ALL
        """
    )
    # how many fail runs have error_message
    with_err = await repo_query(
        """
        SELECT count() AS c FROM kg_extraction_run
        WHERE status = "failed" AND error_message != NONE
        GROUP ALL
        """
    )
    without_err = await repo_query(
        """
        SELECT count() AS c FROM kg_extraction_run
        WHERE status = "failed" AND error_message = NONE
        GROUP ALL
        """
    )
    print(
        json.dumps(
            {
                "dup_group_count": len(dups),
                "dup_groups_by_type": by_type,
                "dup_extra_nodes": sum(int(r.get("c") or 0) - 1 for r in dups),
                "sample_dup_entities": sample,
                "fail_sample": fail,
                "failed_with_error_message": _c(with_err),
                "failed_without_error_message": _c(without_err),
                "mentions_missing_offsets_with_chunk": _c(m1),
                "mentions_missing_offsets_no_chunk": _c(m2),
            },
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
