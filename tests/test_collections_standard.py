"""Tests for collection manifest parsing and URL validation."""

from __future__ import annotations

import pytest

from construction_os.collections.standard import (
    CollectionStandardError,
    normalize_collection_url,
    parse_collection_md,
    parse_items_yaml,
    slugify_name,
)
from construction_os.mcp.url_safety import McpUrlError


VALID_COLLECTION_MD = """---
id: hawaii-construction-authorities
name: Hawaii Construction Authorities
type: collection
version: 1.0.0
description: Official Hawaii construction licensing and permitting sources.
use_when:
  - Researching Hawaii contractor licensing
tags: [hawaii, official-sources]
visibility: instance
status: active
---

Optional prose body.
"""

VALID_ITEMS_YAML = """- id: dcca
  type: url
  title: Hawaii DCCA
  url: https://cca.hawaii.gov/
  enabled: true
  priority: 10
- id: disabled
  type: url
  title: Disabled Source
  url: https://www.hawaii.gov/
  enabled: false
"""


def test_slugify_name():
    assert slugify_name("Hawaii Construction Authorities") == "hawaii-construction-authorities"


def test_parse_collection_md_ok():
    parsed = parse_collection_md(VALID_COLLECTION_MD)
    assert parsed.name == "Hawaii Construction Authorities"
    assert parsed.slug == "hawaii-construction-authorities"
    assert "Hawaii" in (parsed.description or "")
    assert not parsed.errors


def test_parse_collection_md_missing_frontmatter():
    parsed = parse_collection_md("# Just markdown\n")
    assert parsed.errors


def test_parse_items_yaml_ok():
    items, errors = parse_items_yaml(VALID_ITEMS_YAML)
    assert not errors
    assert len(items) == 2
    assert items[0].item_id == "dcca"
    assert items[0].url == "https://cca.hawaii.gov"


def test_parse_items_yaml_duplicate_item_id():
    content = """- id: dup
  type: url
  title: One
  url: https://one.gov
- id: dup
  type: url
  title: Two
  url: https://two.gov
"""
    _, errors = parse_items_yaml(content)
    assert any("duplicate" in e.lower() for e in errors)


def test_parse_items_yaml_bad_url():
    content = """- id: bad
  type: url
  title: Bad
  url: javascript:alert(1)
"""
    _, errors = parse_items_yaml(content)
    assert errors


def test_normalize_collection_url_rejects_file_scheme():
    with pytest.raises((CollectionStandardError, McpUrlError)):
        normalize_collection_url("file:///etc/passwd")


def test_normalize_collection_url_accepts_https():
    assert (
        normalize_collection_url("https://CCA.Hawaii.GOV/path/")
        == "https://cca.hawaii.gov/path/"
    )


def test_parse_items_yaml_text_items_without_url():
    content = """- id: gc
  type: text
  title: "236220"
  enabled: true
- id: elec
  title: "238210"
  enabled: true
"""
    items, errors = parse_items_yaml(content)
    assert not errors
    assert len(items) == 2
    assert items[0].type == "text"
    assert items[0].title == "236220"
    assert items[0].url is None
    assert items[1].type == "text"
    assert items[1].title == "238210"


def test_parse_items_yaml_url_type_still_requires_url():
    content = """- id: missing
  type: url
  title: Missing URL
"""
    _, errors = parse_items_yaml(content)
    assert any("missing url" in e.lower() for e in errors)
