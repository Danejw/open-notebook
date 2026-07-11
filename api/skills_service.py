"""Business logic for Skills CRUD, import, export, and validation."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import List, Optional

from loguru import logger

from api.skill_models import (
    SkillBulkImportConfirmResponse,
    SkillBulkImportPreviewItem,
    SkillBulkImportPreviewResponse,
    SkillCreateRequest,
    SkillDetailResponse,
    SkillFileSchema,
    SkillImportConfirmRequest,
    SkillImportPreviewResponse,
    SkillResponse,
    ValidationIssueResponse,
    ValidationResponse,
)
from construction_os.domain.skill import Skill, SkillFile
from construction_os.exceptions import InvalidInputError, NotFoundError
from construction_os.skills.standard import (
    REQUIRED_ENTRY,
    SkillStandardError,
    guess_mime_type,
    is_required_path,
    normalize_relative_path,
    parse_skill_md,
)
from construction_os.skills.validation import validate_skill_files
from construction_os.skills.zip_io import (
    SkillFilePayload,
    build_skill_zip,
    extract_all_skills_from_zip,
    extract_skill_zip,
)


def _default_skill_md(name: str, description: str) -> str:
    return (
        f"---\nname: {name}\ndescription: {description}\n---\n\n"
        f"# {name}\n\n## Instructions\n\nDescribe how to use this skill.\n"
    )


def _payloads_from_schemas(files: List[SkillFileSchema]) -> List[SkillFilePayload]:
    payloads: List[SkillFilePayload] = []
    for f in files:
        path = normalize_relative_path(f.path)
        payloads.append(
            SkillFilePayload(
                path=path,
                filename=PurePosixPath(path).name,
                content=f.content,
                encoding=f.encoding or "utf-8",
                mime_type=f.mime_type or guess_mime_type(path),
                size_bytes=f.size_bytes or len(f.content.encode("utf-8")),
                required=is_required_path(path),
            )
        )
    return payloads


def _schemas_from_payloads(files: List[SkillFilePayload]) -> List[SkillFileSchema]:
    return [
        SkillFileSchema(
            path=f.path,
            filename=f.filename,
            content=f.content,
            encoding=f.encoding,
            mime_type=f.mime_type,
            size_bytes=f.size_bytes,
            required=f.required,
        )
        for f in files
    ]


async def _file_count(skill: Skill) -> int:
    files = await skill.get_files()
    return len(files)


async def skill_to_response(skill: Skill, include_files: bool = False):
    files = await skill.get_files()
    base = dict(
        id=skill.id or "",
        name=skill.name,
        description=skill.description,
        tags=skill.tags or [],
        owner=skill.owner,
        visibility=skill.visibility,
        status=skill.status,
        archived=bool(skill.archived),
        validation_results=skill.validation_results,
        version=skill.version,
        file_count=len(files),
        created=str(skill.created) if skill.created else None,
        updated=str(skill.updated) if skill.updated else None,
    )
    if include_files:
        return SkillDetailResponse(
            **base,
            files=[
                SkillFileSchema(
                    path=f.path,
                    filename=f.filename,
                    content=f.content,
                    encoding=f.encoding,
                    mime_type=f.mime_type,
                    size_bytes=f.size_bytes,
                    required=f.required,
                )
                for f in files
            ],
        )
    return SkillResponse(**base)


async def list_skills(archived: Optional[bool] = False) -> List[SkillResponse]:
    skills = await Skill.get_all(order_by="updated desc")
    out: List[SkillResponse] = []
    for s in skills:
        if archived is None or bool(s.archived) == archived:
            out.append(await skill_to_response(s))
    return out


async def get_skill(skill_id: str) -> SkillDetailResponse:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    return await skill_to_response(skill, include_files=True)  # type: ignore[return-value]


async def create_skill(data: SkillCreateRequest) -> SkillDetailResponse:
    name = data.name.strip()
    description = data.description.strip()
    files = data.files
    if not files:
        content = _default_skill_md(name, description or f"Skill {name}. Use when needed.")
        if not description:
            parsed = parse_skill_md(content)
            description = parsed.description or f"Skill {name}. Use when needed."
        files = [
            SkillFileSchema(
                path=REQUIRED_ENTRY,
                filename=REQUIRED_ENTRY,
                content=content,
                encoding="utf-8",
                mime_type="text/markdown",
                size_bytes=len(content.encode("utf-8")),
                required=True,
            )
        ]
    payloads = _payloads_from_schemas(files)
    result = validate_skill_files(
        payloads,
        metadata_name=name,
        metadata_description=description,
        export_root=name,
    )
    if not result.valid:
        raise InvalidInputError(
            "; ".join(i.message for i in result.errors) or "Skill validation failed"
        )

    skill = Skill(
        name=name,
        description=description,
        tags=data.tags or [],
        owner=data.owner,
        visibility=data.visibility or "instance",
        status=data.status or "draft",
        version=data.version,
        validation_results=result.to_dict(),
    )
    await skill.save()
    await _replace_files(skill, payloads)
    return await skill_to_response(skill, include_files=True)  # type: ignore[return-value]


async def update_skill_metadata(skill_id: str, data) -> SkillResponse:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    for field in ("name", "description", "tags", "owner", "visibility", "status", "archived", "version"):
        value = getattr(data, field, None)
        if value is not None:
            setattr(skill, field, value)
    await skill.save()
    return await skill_to_response(skill)  # type: ignore[return-value]


async def _replace_files(skill: Skill, payloads: List[SkillFilePayload]) -> None:
    await skill.delete_files()
    for p in payloads:
        sf = SkillFile(
            skill=skill.id or "",
            path=p.path,
            filename=p.filename,
            content=p.content,
            encoding=p.encoding,
            mime_type=p.mime_type,
            size_bytes=p.size_bytes,
            required=p.required,
        )
        await sf.save()


async def replace_skill_files(skill_id: str, files: List[SkillFileSchema]) -> SkillDetailResponse:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    payloads = _payloads_from_schemas(files)
    result = validate_skill_files(
        payloads,
        metadata_name=skill.name,
        metadata_description=skill.description,
        export_root=skill.name,
    )
    if not result.valid:
        raise InvalidInputError(
            "; ".join(i.message for i in result.errors) or "Skill validation failed"
        )
    await _replace_files(skill, payloads)
    skill.validation_results = result.to_dict()
    await skill.save()
    return await skill_to_response(skill, include_files=True)  # type: ignore[return-value]


async def upsert_skill_file(skill_id: str, path: str, content: str, encoding: str = "utf-8", mime_type: Optional[str] = None) -> SkillDetailResponse:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    normalized = normalize_relative_path(path)
    files = await skill.get_files()
    payloads = [
        SkillFilePayload(
            path=f.path,
            filename=f.filename,
            content=f.content,
            encoding=f.encoding,
            mime_type=f.mime_type,
            size_bytes=f.size_bytes,
            required=f.required,
        )
        for f in files
        if f.path != normalized
    ]
    payloads.append(
        SkillFilePayload(
            path=normalized,
            filename=PurePosixPath(normalized).name,
            content=content,
            encoding=encoding,
            mime_type=mime_type or guess_mime_type(normalized),
            size_bytes=len(content.encode("utf-8")) if encoding == "utf-8" else len(content),
            required=is_required_path(normalized),
        )
    )
    return await replace_skill_files(skill_id, _schemas_from_payloads(payloads))


async def delete_skill_file(skill_id: str, path: str) -> SkillDetailResponse:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    normalized = normalize_relative_path(path)
    if normalized == REQUIRED_ENTRY:
        raise InvalidInputError("Cannot delete required SKILL.md")
    files = await skill.get_files()
    payloads = [
        SkillFilePayload(
            path=f.path,
            filename=f.filename,
            content=f.content,
            encoding=f.encoding,
            mime_type=f.mime_type,
            size_bytes=f.size_bytes,
            required=f.required,
        )
        for f in files
        if f.path != normalized
    ]
    return await replace_skill_files(skill_id, _schemas_from_payloads(payloads))


async def move_skill_file(skill_id: str, from_path: str, to_path: str) -> SkillDetailResponse:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    src = normalize_relative_path(from_path)
    dst = normalize_relative_path(to_path)
    if src == REQUIRED_ENTRY and dst != REQUIRED_ENTRY:
        raise InvalidInputError("Cannot rename/move required SKILL.md away")
    files = await skill.get_files()
    found = False
    payloads: List[SkillFilePayload] = []
    for f in files:
        if f.path == src:
            found = True
            payloads.append(
                SkillFilePayload(
                    path=dst,
                    filename=PurePosixPath(dst).name,
                    content=f.content,
                    encoding=f.encoding,
                    mime_type=guess_mime_type(dst),
                    size_bytes=f.size_bytes,
                    required=is_required_path(dst),
                )
            )
        elif f.path == dst:
            raise InvalidInputError(f"Target path already exists: {dst}")
        else:
            payloads.append(
                SkillFilePayload(
                    path=f.path,
                    filename=f.filename,
                    content=f.content,
                    encoding=f.encoding,
                    mime_type=f.mime_type,
                    size_bytes=f.size_bytes,
                    required=f.required,
                )
            )
    if not found:
        raise NotFoundError(f"File not found: {src}")
    return await replace_skill_files(skill_id, _schemas_from_payloads(payloads))


async def delete_skill(skill_id: str) -> None:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    await skill.delete()


async def archive_skill(skill_id: str, archived: bool = True) -> SkillResponse:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    skill.archived = archived
    skill.status = "archived" if archived else "active"
    await skill.save()
    return await skill_to_response(skill)  # type: ignore[return-value]


def preview_import_zip(data: bytes) -> SkillImportPreviewResponse:
    try:
        preview = extract_skill_zip(data)
    except SkillStandardError as e:
        raise InvalidInputError(str(e)) from e
    return SkillImportPreviewResponse(
        root_name=preview.root_name,
        name=preview.name,
        description=preview.description,
        files=_schemas_from_payloads(preview.files),
        errors=preview.errors,
        warnings=preview.warnings,
    )


def preview_import_bulk(
    uploads: list[tuple[str, bytes]],
) -> SkillBulkImportPreviewResponse:
    items: list[SkillBulkImportPreviewItem] = []
    top_errors: list[str] = []

    for filename, data in uploads:
        try:
            previews = extract_all_skills_from_zip(data)
        except SkillStandardError as e:
            top_errors.append(f"{filename}: {e}")
            continue
        for preview in previews:
            items.append(
                SkillBulkImportPreviewItem(
                    root_name=preview.root_name,
                    name=preview.name,
                    description=preview.description,
                    files=_schemas_from_payloads(preview.files),
                    errors=preview.errors,
                    warnings=preview.warnings,
                    source_filename=filename,
                    selected=len(preview.errors) == 0,
                )
            )

    if not items and top_errors:
        raise InvalidInputError("; ".join(top_errors))

    return SkillBulkImportPreviewResponse(items=items, errors=top_errors)


async def confirm_import(data: SkillImportConfirmRequest) -> SkillDetailResponse:
    return await create_skill(
        SkillCreateRequest(
            name=data.name,
            description=data.description,
            tags=data.tags,
            owner=data.owner,
            status="active",
            files=data.files,
        )
    )


async def confirm_import_bulk(
    items: list[SkillImportConfirmRequest],
) -> SkillBulkImportConfirmResponse:
    imported = []
    failed: list[str] = []
    for item in items:
        try:
            skill = await confirm_import(item)
            imported.append(skill)
        except Exception as e:
            logger.error(f"Bulk import failed for {item.name}: {e}")
            failed.append(f"{item.name}: {e}")
    return SkillBulkImportConfirmResponse(imported=imported, failed=failed)


async def validate_skill(skill_id: str) -> ValidationResponse:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    files = await skill.get_files()
    payloads = [
        SkillFilePayload(
            path=f.path,
            filename=f.filename,
            content=f.content,
            encoding=f.encoding,
            mime_type=f.mime_type,
            size_bytes=f.size_bytes,
            required=f.required,
        )
        for f in files
    ]
    result = validate_skill_files(
        payloads,
        metadata_name=skill.name,
        metadata_description=skill.description,
        export_root=skill.name,
    )
    skill.validation_results = result.to_dict()
    if result.valid and skill.status == "draft":
        skill.status = "active"
    await skill.save()
    return ValidationResponse(
        valid=result.valid,
        issues=[
            ValidationIssueResponse(
                severity=i.severity,
                message=i.message,
                path=i.path,
                fix=i.fix,
            )
            for i in result.issues
        ],
    )


async def export_skill_zip(skill_id: str) -> tuple[bytes, str]:
    skill = await Skill.get(skill_id)
    if not skill:
        raise NotFoundError(f"Skill not found: {skill_id}")
    files = await skill.get_files()
    payloads = [
        SkillFilePayload(
            path=f.path,
            filename=f.filename,
            content=f.content,
            encoding=f.encoding,
            mime_type=f.mime_type,
            size_bytes=f.size_bytes,
            required=f.required,
        )
        for f in files
    ]
    result = validate_skill_files(
        payloads,
        metadata_name=skill.name,
        metadata_description=skill.description,
        export_root=skill.name,
    )
    if not result.valid:
        raise InvalidInputError(
            "Cannot export invalid skill: "
            + "; ".join(i.message for i in result.errors)
        )
    try:
        data = build_skill_zip(payloads, skill.name)
    except SkillStandardError as e:
        raise InvalidInputError(str(e)) from e
    return data, f"{skill.name}.zip"
