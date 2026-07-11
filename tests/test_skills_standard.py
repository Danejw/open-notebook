"""Tests for skill standard, ZIP I/O, and validation."""

from __future__ import annotations

import io
import zipfile

import pytest

from construction_os.skills.standard import (
    SkillStandardError,
    normalize_relative_path,
    parse_skill_md,
)
from construction_os.skills.validation import validate_skill_files
from construction_os.skills.zip_io import (
    SkillFilePayload,
    build_skill_zip,
    extract_skill_zip,
)


VALID_SKILL_MD = """---
name: plumbing-review
description: Review plumbing drawings for code compliance. Use when analyzing plumbing plans or P-sheets.
---

# Plumbing Review

## Instructions
1. Read the schedules.
2. See `references/codes.md` for code notes.
"""


def _make_zip(files: dict[str, str], root: str = "plumbing-review") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for path, content in files.items():
            zf.writestr(f"{root}/{path}", content)
    return buf.getvalue()


def test_normalize_rejects_traversal():
    with pytest.raises(SkillStandardError):
        normalize_relative_path("../etc/passwd")
    with pytest.raises(SkillStandardError):
        normalize_relative_path("/abs/path")


def test_normalize_accepts_nested():
    assert normalize_relative_path("references/codes.md") == "references/codes.md"


def test_parse_skill_md_ok():
    parsed = parse_skill_md(VALID_SKILL_MD)
    assert parsed.name == "plumbing-review"
    assert "plumbing" in (parsed.description or "").lower()
    assert not parsed.errors


def test_parse_skill_md_missing_frontmatter():
    parsed = parse_skill_md("# Just a title\n")
    assert parsed.errors


def test_extract_zip_and_round_trip():
    data = _make_zip(
        {
            "SKILL.md": VALID_SKILL_MD,
            "references/codes.md": "# Codes\nIPC 2021\n",
        }
    )
    preview = extract_skill_zip(data)
    assert preview.name == "plumbing-review"
    assert any(f.path == "SKILL.md" for f in preview.files)
    assert any(f.path == "references/codes.md" for f in preview.files)

    rebuilt = build_skill_zip(preview.files, preview.name or "skill")
    again = extract_skill_zip(rebuilt)
    paths_a = sorted(f.path for f in preview.files)
    paths_b = sorted(f.path for f in again.files)
    assert paths_a == paths_b
    by_a = {f.path: f.content for f in preview.files}
    by_b = {f.path: f.content for f in again.files}
    assert by_a == by_b


def test_extract_all_skills_from_multi_skill_zip():
    from construction_os.skills.zip_io import extract_all_skills_from_zip

    skill_b = """---
name: gas-check
description: Review gas piping plans. Use when checking gas isometrics.
---

# Gas Check
"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("plumbing-review/SKILL.md", VALID_SKILL_MD)
        zf.writestr("plumbing-review/references/codes.md", "# Codes\n")
        zf.writestr("gas-check/SKILL.md", skill_b)
    previews = extract_all_skills_from_zip(buf.getvalue())
    names = sorted(p.name for p in previews)
    assert names == ["gas-check", "plumbing-review"]
    plumbing = next(p for p in previews if p.name == "plumbing-review")
    assert any(f.path == "references/codes.md" for f in plumbing.files)


def test_extract_rejects_path_traversal_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("evil/SKILL.md", VALID_SKILL_MD)
        zf.writestr("evil/../../outside.txt", "nope")
    preview = extract_skill_zip(buf.getvalue())
    assert all(".." not in f.path for f in preview.files)


def test_extract_requires_skill_md():
    data = _make_zip({"readme.md": "hi"})
    with pytest.raises(SkillStandardError, match="SKILL.md"):
        extract_skill_zip(data)


def test_validate_missing_skill_md():
    result = validate_skill_files(
        [
            SkillFilePayload(
                path="notes.txt",
                filename="notes.txt",
                content="x",
                encoding="utf-8",
                mime_type="text/plain",
                size_bytes=1,
            )
        ],
        check_reconstruction=False,
    )
    assert not result.valid
    assert any("SKILL.md" in i.message for i in result.errors)


def test_validate_ok_with_reference_warning():
    files = [
        SkillFilePayload(
            path="SKILL.md",
            filename="SKILL.md",
            content=VALID_SKILL_MD,
            encoding="utf-8",
            mime_type="text/markdown",
            size_bytes=len(VALID_SKILL_MD),
            required=True,
        )
    ]
    result = validate_skill_files(
        files,
        metadata_name="plumbing-review",
        metadata_description="Review plumbing drawings for code compliance. Use when analyzing plumbing plans.",
        check_reconstruction=True,
        export_root="plumbing-review",
    )
    assert result.valid
    assert any("references/codes.md" in (i.message or "") for i in result.warnings)
