"""Tests for best-effort opportunity document ingest on pursue."""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock

import pytest

from construction_os.domain.opportunity import Opportunity
from construction_os.domain.project import Project
from construction_os.services import opportunities as opportunities_service


@pytest.mark.asyncio
async def test_ingest_opportunity_documents_best_effort(monkeypatch, tmp_path):
    opportunity = Opportunity(
        source_key="sam_gov_hawaii",
        external_id="n1",
        fingerprint="f" * 64,
        title="Test Opp",
        agency="NAVY",
        source_url="https://sam.gov/opp/n1/view",
        documents=[
            {"url": "https://example.test/ok.pdf", "name": "ok.pdf"},
            {"url": "https://example.test/bad.pdf", "name": "bad.pdf"},
            {"url": "https://example.test/ok.pdf", "name": "dup.pdf"},
        ],
    )
    project = Project(name="Bid", description="x")
    project.id = "project:test"

    async def fake_download(url, *, preferred_name=None, api_key=None, client=None):
        if "bad" in url:
            raise RuntimeError("download failed")
        path = tmp_path / (preferred_name or "file.bin")
        path.write_bytes(b"%PDF-1.4")
        return str(path)

    created: List[Dict[str, Any]] = []

    async def fake_create(*, file_path, project_id, title=None, embed=True):
        source = MagicMock()
        source.id = f"source:{len(created) + 1}"
        created.append({"file_path": file_path, "title": title})
        return source

    save_mock = AsyncMock()
    monkeypatch.setattr(Opportunity, "save", save_mock)
    monkeypatch.setattr(
        "construction_os.services.opportunity_collectors.download_sam_attachment",
        fake_download,
    )
    monkeypatch.setattr(
        opportunities_service,
        "create_upload_source_and_process",
        fake_create,
    )

    result = await opportunities_service.ingest_opportunity_documents(
        opportunity, project
    )

    assert len(result.documents) == 3
    assert result.documents[0]["ingest_status"] == "queued"
    assert result.documents[0]["source_id"] == "source:1"
    assert result.documents[1]["ingest_status"] == "failed"
    assert "download failed" in result.documents[1]["error"]
    assert result.documents[2]["ingest_status"] == "skipped"
    assert len(created) == 1
    save_mock.assert_awaited()
