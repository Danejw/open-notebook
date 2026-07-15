"""Tests for loading HtmlTemplate into chat execute forwarded props."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_html_template_loaded_into_forwarded_props_shape():
    """Mirrors chat execute resolution: template id → meta dict for the graph."""
    from construction_os.exceptions import NotFoundError

    tmpl = MagicMock()
    tmpl.id = "html_template:t1"
    tmpl.name = "KCDBC Bid"
    tmpl.category = "estimate"
    tmpl.html_body = "<html><body><span>x</span></body></html>"

    with patch(
        "construction_os.domain.html_document.HtmlTemplate.get",
        new=AsyncMock(return_value=tmpl),
    ):
        from construction_os.domain.html_document import HtmlTemplate

        loaded = await HtmlTemplate.get("html_template:t1")
        html_template_meta = {
            "id": loaded.id,
            "name": loaded.name,
            "category": loaded.category,
            "html_body": loaded.html_body,
        }
        forwarded = {
            "html_template_id": "html_template:t1",
            "html_template": html_template_meta,
        }

    assert forwarded["html_template_id"] == "html_template:t1"
    assert forwarded["html_template"]["name"] == "KCDBC Bid"
    assert "<span>x</span>" in forwarded["html_template"]["html_body"]

    with patch(
        "construction_os.domain.html_document.HtmlTemplate.get",
        new=AsyncMock(side_effect=NotFoundError("missing")),
    ):
        html_template_id = "html_template:missing"
        html_template_meta = None
        try:
            await HtmlTemplate.get(html_template_id)
        except NotFoundError:
            html_template_id = None
            html_template_meta = None

    assert html_template_id is None
    assert html_template_meta is None
