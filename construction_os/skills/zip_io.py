"""Safe ZIP import/export for skill packages."""

from __future__ import annotations

import base64
import io
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Optional

from open_notebook.skills.standard import (
    FORBIDDEN_BASENAMES,
    MAX_FILE_BYTES,
    MAX_FILE_COUNT,
    MAX_PACKAGE_BYTES,
    REQUIRED_ENTRY,
    SkillStandardError,
    guess_mime_type,
    is_text_path,
    normalize_relative_path,
    parse_skill_md,
    validate_file_path_rules,
)


@dataclass
class SkillFilePayload:
    path: str
    filename: str
    content: str
    encoding: str  # "utf-8" | "base64"
    mime_type: str
    size_bytes: int
    required: bool = False


@dataclass
class SkillPackagePreview:
    root_name: str
    files: list[SkillFilePayload]
    name: Optional[str] = None
    description: Optional[str] = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _is_ignored_archive_path(name: str) -> bool:
    lowered = name.replace("\\", "/").lower()
    parts = PurePosixPath(lowered).parts
    if any(p in FORBIDDEN_BASENAMES or p.startswith("__macosx") for p in parts):
        return True
    if lowered.endswith("/"):
        return True
    return False


def _find_all_skill_roots(names: list[str]) -> list[tuple[str, list[str]]]:
    """Find every skill root (directory containing SKILL.md) and its relative files."""
    normalized = []
    for n in names:
        if _is_ignored_archive_path(n):
            continue
        path = n.replace("\\", "/")
        if path.endswith("/"):
            continue
        normalized.append(path)

    skill_md_paths = [p for p in normalized if PurePosixPath(p).name == REQUIRED_ENTRY]
    if not skill_md_paths:
        raise SkillStandardError("ZIP does not contain SKILL.md")

    # Deepest roots first so nested skills claim their files before parents
    skill_md_paths.sort(key=lambda p: (-p.count("/"), p))
    claimed: set[str] = set()
    roots: list[tuple[str, list[str]]] = []

    for skill_md in skill_md_paths:
        parent = str(PurePosixPath(skill_md).parent)
        prefix = "" if parent in {".", ""} else parent
        prefix_slash = f"{prefix}/" if prefix else ""
        relatives: list[str] = []
        for p in normalized:
            if p in claimed:
                continue
            if prefix:
                if p != skill_md and not p.startswith(prefix_slash):
                    continue
                rel = REQUIRED_ENTRY if p == skill_md else p[len(prefix_slash) :]
            else:
                # Root-level skill: only unclaimed files not under another skill folder
                # (deeper skills already claimed their trees)
                rel = p
            if not rel or rel.endswith("/"):
                continue
            relatives.append(rel)
            claimed.add(p)

        if REQUIRED_ENTRY not in relatives:
            continue
        roots.append((prefix, relatives))

    if not roots:
        raise SkillStandardError("Could not locate SKILL.md at skill root")

    # Return shallowest-first for stable UI ordering
    roots.sort(key=lambda item: (item[0].count("/"), item[0] or ""))
    return roots


def _find_skill_root(names: list[str]) -> tuple[str, list[str]]:
    """Locate the primary (shallowest) skill root; return (prefix, relative names)."""
    roots = _find_all_skill_roots(names)
    prefix, relatives = roots[0]
    return prefix, relatives


def _build_preview_from_zip_infos(
    zf: zipfile.ZipFile,
    infos: list[zipfile.ZipInfo],
    prefix: str,
    relatives: list[str],
) -> SkillPackagePreview:
    root_name = PurePosixPath(prefix).name if prefix else "skill"
    by_rel: dict[str, zipfile.ZipInfo] = {}
    for info in infos:
        path = info.filename.replace("\\", "/")
        if prefix:
            if path == f"{prefix}/{REQUIRED_ENTRY}":
                rel = REQUIRED_ENTRY
            elif path.startswith(prefix + "/"):
                rel = path[len(prefix) + 1 :]
            else:
                continue
        else:
            rel = path
        if rel in relatives:
            by_rel[rel] = info

    files: list[SkillFilePayload] = []
    errors: list[str] = []
    warnings: list[str] = []

    for rel in sorted(by_rel.keys()):
        path_errors = validate_file_path_rules(rel)
        if path_errors:
            errors.extend(f"{rel}: {e}" for e in path_errors)
            continue
        try:
            normalized = normalize_relative_path(rel)
        except SkillStandardError as e:
            errors.append(str(e))
            continue

        raw = zf.read(by_rel[rel])
        if len(raw) > MAX_FILE_BYTES:
            errors.append(f"{normalized}: file too large")
            continue

        if is_text_path(normalized):
            try:
                content = raw.decode("utf-8")
                encoding = "utf-8"
            except UnicodeDecodeError:
                content = base64.b64encode(raw).decode("ascii")
                encoding = "base64"
                warnings.append(f"{normalized}: not valid UTF-8; stored as base64")
        else:
            encoding = "base64"
            content = base64.b64encode(raw).decode("ascii")

        files.append(
            SkillFilePayload(
                path=normalized,
                filename=PurePosixPath(normalized).name,
                content=content,
                encoding=encoding,
                mime_type=guess_mime_type(normalized),
                size_bytes=len(raw),
                required=normalized == REQUIRED_ENTRY,
            )
        )

    name = root_name
    description = None
    skill_md = next((f for f in files if f.path == REQUIRED_ENTRY), None)
    if skill_md and skill_md.encoding == "utf-8":
        parsed = parse_skill_md(skill_md.content)
        errors.extend(parsed.errors)
        if parsed.name:
            name = parsed.name
        if parsed.description:
            description = parsed.description
    elif not skill_md:
        errors.append("SKILL.md is required")

    return SkillPackagePreview(
        root_name=root_name,
        files=files,
        name=name,
        description=description,
        errors=errors,
        warnings=warnings,
    )


def _open_and_scan_zip(
    data: bytes, *, max_files: int = MAX_FILE_COUNT
) -> tuple[zipfile.ZipFile, list[zipfile.ZipInfo]]:
    if not data:
        raise SkillStandardError("Empty ZIP upload")
    if len(data) > MAX_PACKAGE_BYTES:
        raise SkillStandardError(
            f"ZIP exceeds maximum package size of {MAX_PACKAGE_BYTES} bytes"
        )

    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise SkillStandardError("Malformed ZIP archive") from e

    total_uncompressed = 0
    infos = []
    for info in zf.infolist():
        if info.is_dir() or _is_ignored_archive_path(info.filename):
            continue
        total_uncompressed += info.file_size
        if info.file_size > MAX_FILE_BYTES:
            raise SkillStandardError(
                f"File exceeds max size ({MAX_FILE_BYTES} bytes): {info.filename}"
            )
        if total_uncompressed > MAX_PACKAGE_BYTES:
            raise SkillStandardError("Uncompressed package exceeds maximum size")
        infos.append(info)

    if len(infos) > max_files:
        raise SkillStandardError(f"Package exceeds maximum of {max_files} files")
    return zf, infos


def extract_skill_zip(data: bytes) -> SkillPackagePreview:
    """Safely extract a skill ZIP into an in-memory preview (not persisted).

    If the archive contains multiple skills, returns the shallowest one.
    Use extract_all_skills_from_zip for bulk import.
    """
    zf, infos = _open_and_scan_zip(data)
    prefix, relatives = _find_skill_root([i.filename for i in infos])
    return _build_preview_from_zip_infos(zf, infos, prefix, relatives)


def extract_all_skills_from_zip(data: bytes) -> list[SkillPackagePreview]:
    """Extract every skill package found in a ZIP (one or many SKILL.md roots)."""
    zf, infos = _open_and_scan_zip(data, max_files=MAX_FILE_COUNT * 20)
    roots = _find_all_skill_roots([i.filename for i in infos])
    previews: list[SkillPackagePreview] = []
    for prefix, relatives in roots:
        if len(relatives) > MAX_FILE_COUNT:
            raise SkillStandardError(
                f"Skill '{prefix or 'root'}' exceeds maximum of {MAX_FILE_COUNT} files"
            )
        previews.append(_build_preview_from_zip_infos(zf, infos, prefix, relatives))
    return previews



def build_skill_zip(files: list[SkillFilePayload], root_folder: str) -> bytes:
    """Rebuild a ZIP from canonical file payloads."""
    try:
        root = normalize_relative_path(root_folder) if "/" not in root_folder else root_folder
    except SkillStandardError:
        root = root_folder.strip("/").replace("\\", "/")
    if not root or ".." in root.split("/"):
        raise SkillStandardError("Invalid export root folder name")
    # root should be a single segment (skill folder name)
    root = root.split("/")[0]
    if not root:
        raise SkillStandardError("Invalid export root folder name")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            path = normalize_relative_path(f.path)
            arcname = f"{root}/{path}"
            if f.encoding == "base64":
                data = base64.b64decode(f.content)
            else:
                data = f.content.encode("utf-8")
            zf.writestr(arcname, data)
    out = buf.getvalue()
    if len(out) > MAX_PACKAGE_BYTES:
        raise SkillStandardError("Exported ZIP exceeds maximum package size")
    return out
