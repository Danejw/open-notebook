"""Tests for shared-chat guest_key access helpers in the chat router."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from api.routers.chat import (
    _assert_session_guest_access,
    _normalize_guest_key,
    _session_guest_key,
)


def test_normalize_guest_key_treats_blank_as_none():
    assert _normalize_guest_key(None) is None
    assert _normalize_guest_key("") is None
    assert _normalize_guest_key("   ") is None
    assert _normalize_guest_key("abc") == "abc"
    assert _normalize_guest_key("  abc  ") == "abc"


def test_session_guest_key_reads_optional_field():
    assert _session_guest_key(SimpleNamespace(guest_key=None)) is None
    assert _session_guest_key(SimpleNamespace(guest_key="g1")) == "g1"
    assert _session_guest_key(SimpleNamespace()) is None


def test_assert_session_guest_access_allows_matching_scopes():
    owner_session = SimpleNamespace(guest_key=None)
    guest_session = SimpleNamespace(guest_key="guest-a")

    _assert_session_guest_access(owner_session, None)
    _assert_session_guest_access(guest_session, "guest-a")


def test_assert_session_guest_access_rejects_mismatched_scopes():
    owner_session = SimpleNamespace(guest_key=None)
    guest_session = SimpleNamespace(guest_key="guest-a")

    with pytest.raises(HTTPException) as owner_vs_guest:
        _assert_session_guest_access(owner_session, "guest-a")
    assert owner_vs_guest.value.status_code == 403

    with pytest.raises(HTTPException) as guest_vs_owner:
        _assert_session_guest_access(guest_session, None)
    assert guest_vs_owner.value.status_code == 403

    with pytest.raises(HTTPException) as other_guest:
        _assert_session_guest_access(guest_session, "guest-b")
    assert other_guest.value.status_code == 403
