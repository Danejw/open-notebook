"""Tests for collection chat context loading."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from construction_os.collections.loader import (
    format_collections_context,
    load_one_collection_block,
)
from construction_os.domain.collection import CollectionItem


def test_format_collections_context_empty():
    assert format_collections_context([]) == ""


def test_format_collections_context_wraps_blocks():
    result = format_collections_context(["## Collection: Test\n\nBody"])
    assert "# ACTIVE COLLECTIONS" in result
    assert "## Collection: Test" in result


@pytest.mark.asyncio
async def test_load_one_collection_block_enabled_url_only_and_cap():
    collection = MagicMock()
    collection.id = "collection:1"
    collection.name = "Hawaii Sources"
    collection.description = "Official sources"
    collection.use_when = ["licensing research"]
    collection.tags = ["hawaii"]
    collection.archived = False
    collection.selection = {"max_items": 1}

    items = [
        CollectionItem(
            collection="collection:1",
            item_id="low",
            type="url",
            title="Low Priority",
            url="https://low.gov",
            enabled=True,
            sort_order=0,
            priority=1,
        ),
        CollectionItem(
            collection="collection:1",
            item_id="high",
            type="url",
            title="High Priority",
            url="https://high.gov",
            enabled=True,
            sort_order=1,
            priority=10,
        ),
        CollectionItem(
            collection="collection:1",
            item_id="disabled",
            type="url",
            title="Disabled",
            url="https://disabled.gov",
            enabled=False,
            sort_order=2,
        ),
        CollectionItem(
            collection="collection:1",
            item_id="note",
            type="note",
            title="Note only",
            enabled=True,
            sort_order=3,
        ),
    ]
    collection.get_items = AsyncMock(return_value=items)

    with patch(
        "construction_os.collections.loader.Collection.get",
        new=AsyncMock(return_value=collection),
    ):
        loaded = await load_one_collection_block("collection:1")

    assert loaded["name"] == "Hawaii Sources"
    assert loaded["item_ids"] == ["high"]
    assert "https://high.gov" in loaded["block"]
    assert "https://disabled.gov" not in loaded["block"]
    assert "https://low.gov" not in loaded["block"]
