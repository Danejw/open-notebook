"""Tests for loading HtmlTemplate into chat execute forwarded props."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from construction_os.exceptions import NotFoundError
from construction_os.utils.chat_session import resolve_html_template_meta


@pytest.mark.asyncio
async def test_resolve_html_template_meta_success():
    tmpl = MagicMock()
    tmpl.id = "html_template:t1"
    tmpl.name = "KCDBC Bid"
    tmpl.category = "estimate"
    tmpl.html_body = "<html><body><span>x</span></body></html>"

    with patch(
        "construction_os.utils.chat_session.HtmlTemplate.get",
        new=AsyncMock(return_value=tmpl),
    ), patch(
        "construction_os.utils.chat_session.expand_image_tokens",
        new=AsyncMock(return_value=tmpl.html_body),
    ):
        template_id, meta = await resolve_html_template_meta("html_template:t1")

    assert template_id == "html_template:t1"
    assert meta is not None
    assert meta["name"] == "KCDBC Bid"
    assert "<span>x</span>" in meta["html_body"]


@pytest.mark.asyncio
async def test_resolve_html_template_meta_clears_missing_template_on_session():
    session = MagicMock()
    session.html_template_id = "html_template:missing"

    with patch(
        "construction_os.utils.chat_session.HtmlTemplate.get",
        new=AsyncMock(side_effect=NotFoundError("missing")),
    ):
        template_id, meta = await resolve_html_template_meta(
            "html_template:missing",
            session=session,
        )

    assert template_id is None
    assert meta is None
    assert session.html_template_id is None
