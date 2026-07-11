"""Canonical Agent Skills standard shared by API validation and package I/O.

Mirrors Agent Skills progressive-disclosure conventions:
Tier 1 = name + description, Tier 2 = SKILL.md body, Tier 3 = supporting files.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Optional

import yaml

# Package limits
MAX_PACKAGE_BYTES = 25 * 1024 * 1024  # 25 MiB
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MiB
MAX_FILE_COUNT = 200

REQUIRED_ENTRY = "SKILL.md"
NAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
MAX_NAME_LEN = 64
MAX_DESCRIPTION_LEN = 1024

# Extensions allowed in a skill package (text + common assets)
ALLOWED_EXTENSIONS = frozenset(
    {
        ".md",
        ".txt",
        ".json",
        ".yaml",
        ".yml",
        ".toml",
        ".csv",
        ".py",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".sh",
        ".bash",
        ".ps1",
        ".html",
        ".css",
        ".svg",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".pdf",
        ".xml",
        ".jinja",
        ".j2",
        "",  # extensionless (e.g. LICENSE, Makefile)
    }
)

FORBIDDEN_EXTENSIONS = frozenset(
    {
        ".exe",
        ".dll",
        ".so",
        ".dylib",
        ".bat",
        ".cmd",
        ".com",
        ".msi",
        ".scr",
        ".vbs",
        ".jar",
        ".war",
        ".class",
    }
)

FORBIDDEN_BASENAMES = frozenset(
    {
        ".ds_store",
        "thumbs.db",
        "desktop.ini",
        ".git",
        ".svn",
        "__macosx",
    }
)

TEXT_EXTENSIONS = frozenset(
    {
        ".md",
        ".txt",
        ".json",
        ".yaml",
        ".yml",
        ".toml",
        ".csv",
        ".py",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".sh",
        ".bash",
        ".ps1",
        ".html",
        ".css",
        ".svg",
        ".xml",
        ".jinja",
        ".j2",
        "",
    }
)


@dataclass
class FrontmatterParseResult:
    name: Optional[str]
    description: Optional[str]
    raw: dict[str, Any]
    body: str
    errors: list[str]


class SkillStandardError(ValueError):
    """Raised when a path or package violates the skill standard."""


def normalize_relative_path(path: str) -> str:
    """Normalize to POSIX relative path; raise if unsafe."""
    if path is None:
        raise SkillStandardError("Path is required")
    raw = str(path).replace("\\", "/").strip()
    if not raw or raw in {".", "./"}:
        raise SkillStandardError("Path cannot be empty")
    if "\x00" in raw:
        raise SkillStandardError("Path contains null byte")
    if raw.startswith("/") or re.match(r"^[a-zA-Z]:", raw):
        raise SkillStandardError(f"Absolute paths are not allowed: {path}")
    parts = []
    for part in PurePosixPath(raw).parts:
        if part in ("", "."):
            continue
        if part == "..":
            raise SkillStandardError(f"Path traversal is not allowed: {path}")
        if part.lower() in FORBIDDEN_BASENAMES:
            raise SkillStandardError(f"Forbidden path segment: {part}")
        parts.append(part)
    if not parts:
        raise SkillStandardError(f"Invalid path: {path}")
    return "/".join(parts)


def is_required_path(path: str) -> bool:
    return normalize_relative_path(path) == REQUIRED_ENTRY


def validate_skill_name(name: str) -> list[str]:
    errors: list[str] = []
    if not name or not str(name).strip():
        errors.append("Skill name is required")
        return errors
    name = str(name).strip()
    if len(name) > MAX_NAME_LEN:
        errors.append(f"Skill name must be at most {MAX_NAME_LEN} characters")
    if not NAME_PATTERN.match(name):
        errors.append(
            "Skill name must be kebab-case (lowercase letters, numbers, hyphens)"
        )
    return errors


def validate_skill_description(description: str) -> list[str]:
    errors: list[str] = []
    if not description or not str(description).strip():
        errors.append("Skill description is required")
        return errors
    if len(str(description)) > MAX_DESCRIPTION_LEN:
        errors.append(
            f"Skill description must be at most {MAX_DESCRIPTION_LEN} characters"
        )
    return errors


def validate_file_path_rules(path: str) -> list[str]:
    errors: list[str] = []
    try:
        normalized = normalize_relative_path(path)
    except SkillStandardError as e:
        return [str(e)]
    filename = PurePosixPath(normalized).name
    if filename.lower() in FORBIDDEN_BASENAMES:
        errors.append(f"Forbidden filename: {filename}")
    suffix = PurePosixPath(normalized).suffix.lower()
    if suffix in FORBIDDEN_EXTENSIONS:
        errors.append(f"Forbidden file type: {suffix}")
    elif suffix not in ALLOWED_EXTENSIONS:
        errors.append(f"Unsupported file type: {suffix or '(none)'}")
    return errors


def guess_mime_type(path: str) -> str:
    suffix = PurePosixPath(path).suffix.lower()
    mapping = {
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".json": "application/json",
        ".yaml": "application/yaml",
        ".yml": "application/yaml",
        ".py": "text/x-python",
        ".js": "text/javascript",
        ".ts": "text/typescript",
        ".sh": "text/x-shellscript",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
        ".html": "text/html",
        ".css": "text/css",
        ".csv": "text/csv",
    }
    return mapping.get(suffix, "application/octet-stream")


def is_text_path(path: str) -> bool:
    return PurePosixPath(path).suffix.lower() in TEXT_EXTENSIONS


def parse_skill_md(content: str) -> FrontmatterParseResult:
    """Parse SKILL.md YAML frontmatter and body."""
    errors: list[str] = []
    if content is None:
        return FrontmatterParseResult(None, None, {}, "", ["SKILL.md content is empty"])
    text = content if isinstance(content, str) else content.decode("utf-8", errors="replace")
    if not text.strip():
        return FrontmatterParseResult(None, None, {}, "", ["SKILL.md content is empty"])

    raw: dict[str, Any] = {}
    body = text
    if text.startswith("---"):
        match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.DOTALL)
        if not match:
            errors.append("SKILL.md has invalid YAML frontmatter delimiters")
        else:
            fm_text, body = match.group(1), match.group(2)
            try:
                loaded = yaml.safe_load(fm_text) or {}
                if not isinstance(loaded, dict):
                    errors.append("SKILL.md frontmatter must be a YAML mapping")
                else:
                    raw = loaded
            except yaml.YAMLError as e:
                errors.append(f"SKILL.md frontmatter YAML error: {e}")
    else:
        errors.append("SKILL.md must start with YAML frontmatter (---)")

    name = raw.get("name")
    description = raw.get("description")
    if name is not None:
        name = str(name).strip()
        errors.extend(validate_skill_name(name))
    else:
        errors.append("SKILL.md frontmatter missing required field: name")
    if description is not None:
        description = str(description).strip()
        errors.extend(validate_skill_description(description))
    else:
        errors.append("SKILL.md frontmatter missing required field: description")

    return FrontmatterParseResult(
        name=name if isinstance(name, str) else None,
        description=description if isinstance(description, str) else None,
        raw=raw,
        body=body or "",
        errors=errors,
    )


def extract_referenced_paths(skill_md_body: str) -> list[str]:
    """Find relative file references in markdown links and backticks."""
    refs: list[str] = []
    for match in re.finditer(r"\[[^\]]*\]\(([^)]+)\)", skill_md_body or ""):
        target = match.group(1).strip().split()[0].strip("\"'")
        if "://" in target or target.startswith("#") or target.startswith("mailto:"):
            continue
        refs.append(target)
    for match in re.finditer(
        r"`((?:references|scripts|assets)/[^`\s]+)`", skill_md_body or ""
    ):
        refs.append(match.group(1))
    # Dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for r in refs:
        try:
            n = normalize_relative_path(r)
        except SkillStandardError:
            continue
        if n not in seen and n != REQUIRED_ENTRY:
            seen.add(n)
            out.append(n)
    return out
