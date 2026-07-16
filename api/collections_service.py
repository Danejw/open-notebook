"""Business logic for Collections CRUD, import, export, and validation."""

from __future__ import annotations

from typing import List, Optional

from loguru import logger

from api.collection_models import (
    CollectionCreateRequest,
    CollectionDetailResponse,
    CollectionImportConfirmRequest,
    CollectionImportPreviewResponse,
    CollectionItemSchema,
    CollectionReplaceItemsRequest,
    CollectionResponse,
    CollectionUpdateRequest,
    ValidationIssueResponse,
    ValidationResponse,
)
from construction_os.collections.markdown_io import (
    CollectionPackagePreview,
    build_collection_zip,
    extract_collection_zip,
)
from construction_os.collections.standard import (
    build_collection_md,
    slugify_name,
)
from construction_os.collections.validation import validate_collection_record
from construction_os.domain.collection import Collection, CollectionItem
from construction_os.exceptions import InvalidInputError, NotFoundError


def _schema_to_item_model(
    collection_id: str,
    schema: CollectionItemSchema,
    *,
    sort_order: int,
) -> CollectionItem:
    return CollectionItem(
        collection=collection_id,
        item_id=schema.item_id.strip(),
        type=schema.type or "url",
        title=schema.title.strip(),
        url=schema.url,
        description=schema.description,
        tags=schema.tags or [],
        topics=schema.topics or [],
        authority=schema.authority,
        enabled=schema.enabled,
        priority=schema.priority,
        metadata=schema.metadata,
        sort_order=sort_order if schema.sort_order == 0 else schema.sort_order,
    )


def _item_to_schema(item: CollectionItem) -> CollectionItemSchema:
    return CollectionItemSchema(
        item_id=item.item_id,
        type=item.type,
        title=item.title,
        url=item.url,
        description=item.description,
        tags=item.tags or [],
        topics=item.topics or [],
        authority=item.authority,
        enabled=item.enabled,
        priority=item.priority,
        metadata=item.metadata,
        sort_order=item.sort_order,
    )


async def _ensure_unique_slug(slug: str, exclude_id: Optional[str] = None) -> None:
    existing = await Collection.get_all()
    for coll in existing:
        if coll.slug == slug and coll.id != exclude_id:
            raise InvalidInputError(f"Collection slug already exists: {slug}")


async def collection_to_response(
    collection: Collection,
    *,
    include_items: bool = False,
) -> CollectionResponse | CollectionDetailResponse:
    items = await collection.get_items()
    base = dict(
        id=collection.id or "",
        name=collection.name,
        slug=collection.slug,
        description=collection.description,
        version=collection.version,
        tags=collection.tags or [],
        use_when=collection.use_when or [],
        owner=collection.owner,
        visibility=collection.visibility,
        status=collection.status,
        archived=bool(collection.archived),
        selection=collection.selection,
        manifest_extra=collection.manifest_extra,
        validation_results=collection.validation_results,
        item_count=len(items),
        created=str(collection.created) if collection.created else None,
        updated=str(collection.updated) if collection.updated else None,
    )
    if include_items:
        return CollectionDetailResponse(
            **base,
            items=[_item_to_schema(i) for i in items],
        )
    return CollectionResponse(**base)


async def list_collections(archived: Optional[bool] = False) -> List[CollectionResponse]:
    collections = await Collection.get_all(order_by="updated desc")
    out: List[CollectionResponse] = []
    for coll in collections:
        if archived is None or bool(coll.archived) == archived:
            out.append(await collection_to_response(coll))  # type: ignore[arg-type]
    return out


async def get_collection(collection_id: str) -> CollectionDetailResponse:
    collection = await Collection.get(collection_id)
    if not collection:
        raise NotFoundError(f"Collection not found: {collection_id}")
    return await collection_to_response(collection, include_items=True)  # type: ignore[return-value]


async def _save_items(
    collection: Collection,
    items: List[CollectionItemSchema],
) -> None:
    if not collection.id:
        raise InvalidInputError("Collection must be saved before items")
    await collection.delete_items()
    for index, schema in enumerate(items):
        item = _schema_to_item_model(collection.id, schema, sort_order=index)
        await item.save()


async def create_collection(data: CollectionCreateRequest) -> CollectionDetailResponse:
    name = data.name.strip()
    if not name:
        raise InvalidInputError("Collection name is required")
    slug = (data.slug or "").strip() or slugify_name(name)
    await _ensure_unique_slug(slug)
    description = data.description.strip()
    manifest_raw = build_collection_md(
        name=name,
        slug=slug,
        description=description or f"Collection {name}",
        version=data.version or "1.0.0",
        tags=data.tags,
        use_when=data.use_when,
        visibility=data.visibility,
        status=data.status,
        selection=data.selection,
        extra=data.manifest_extra,
    )
    collection = Collection(
        name=name,
        slug=slug,
        description=description or f"Collection {name}",
        version=data.version or "1.0.0",
        tags=data.tags or [],
        use_when=data.use_when or [],
        owner=data.owner,
        visibility=data.visibility,
        status=data.status,
        selection=data.selection,
        manifest_extra=data.manifest_extra,
        manifest_raw=manifest_raw,
    )
    await collection.save()
    await _save_items(collection, data.items)
    collection.validation_results = await validate_collection_record(collection)
    if collection.validation_results.get("valid") and collection.status == "draft":
        collection.status = "active"
    await collection.save()
    return await get_collection(collection.id or "")


async def update_collection(
    collection_id: str,
    data: CollectionUpdateRequest,
) -> CollectionResponse:
    collection = await Collection.get(collection_id)
    if not collection:
        raise NotFoundError(f"Collection not found: {collection_id}")

    if data.name is not None:
        collection.name = data.name.strip()
    if data.slug is not None:
        slug = data.slug.strip()
        await _ensure_unique_slug(slug, exclude_id=collection.id)
        collection.slug = slug
    if data.description is not None:
        collection.description = data.description.strip()
    if data.version is not None:
        collection.version = data.version
    if data.tags is not None:
        collection.tags = data.tags
    if data.use_when is not None:
        collection.use_when = data.use_when
    if data.owner is not None:
        collection.owner = data.owner
    if data.visibility is not None:
        collection.visibility = data.visibility
    if data.status is not None:
        collection.status = data.status
    if data.archived is not None:
        collection.archived = data.archived
    if data.selection is not None:
        collection.selection = data.selection
    if data.manifest_extra is not None:
        collection.manifest_extra = data.manifest_extra

    collection.manifest_raw = build_collection_md(
        name=collection.name,
        slug=collection.slug,
        description=collection.description,
        version=collection.version or "1.0.0",
        tags=collection.tags,
        use_when=collection.use_when,
        visibility=collection.visibility,
        status=collection.status,
        selection=collection.selection,
        extra=collection.manifest_extra,
    )
    collection.validation_results = await validate_collection_record(collection)
    await collection.save()
    return await collection_to_response(collection)  # type: ignore[return-value]


async def replace_collection_items(
    collection_id: str,
    data: CollectionReplaceItemsRequest,
) -> CollectionDetailResponse:
    collection = await Collection.get(collection_id)
    if not collection:
        raise NotFoundError(f"Collection not found: {collection_id}")
    await _save_items(collection, data.items)
    collection.validation_results = await validate_collection_record(collection)
    await collection.save()
    return await get_collection(collection_id)


async def duplicate_collection(collection_id: str) -> CollectionDetailResponse:
    source = await Collection.get(collection_id)
    if not source:
        raise NotFoundError(f"Collection not found: {collection_id}")
    items = await source.get_items()
    base_slug = f"{source.slug}-copy"
    slug = base_slug
    suffix = 2
    while True:
        try:
            await _ensure_unique_slug(slug)
            break
        except InvalidInputError:
            slug = f"{base_slug}-{suffix}"
            suffix += 1

    payload = CollectionCreateRequest(
        name=f"{source.name} (copy)",
        slug=slug,
        description=source.description,
        version=source.version,
        tags=source.tags,
        use_when=source.use_when,
        owner=source.owner,
        visibility=source.visibility,
        status="draft",
        selection=source.selection,
        manifest_extra=source.manifest_extra,
        items=[_item_to_schema(i) for i in items],
    )
    return await create_collection(payload)


async def archive_collection(collection_id: str) -> CollectionResponse:
    collection = await Collection.get(collection_id)
    if not collection:
        raise NotFoundError(f"Collection not found: {collection_id}")
    collection.archived = True
    collection.status = "archived"
    await collection.save()
    return await collection_to_response(collection)  # type: ignore[return-value]


async def delete_collection(collection_id: str) -> None:
    collection = await Collection.get(collection_id)
    if not collection:
        raise NotFoundError(f"Collection not found: {collection_id}")
    await collection.delete()


async def validate_collection(collection_id: str) -> ValidationResponse:
    collection = await Collection.get(collection_id)
    if not collection:
        raise NotFoundError(f"Collection not found: {collection_id}")
    result = await validate_collection_record(collection)
    collection.validation_results = result
    await collection.save()
    return ValidationResponse(
        valid=bool(result.get("valid")),
        issues=[
            ValidationIssueResponse(**issue)
            for issue in result.get("issues", [])
        ],
    )


def _preview_to_response(preview: CollectionPackagePreview) -> CollectionImportPreviewResponse:
    return CollectionImportPreviewResponse(
        root_name=preview.root_name,
        name=preview.name,
        slug=preview.slug,
        description=preview.description,
        items=[
            CollectionItemSchema(
                item_id=i.item_id,
                type=i.type,
                title=i.title,
                url=i.url,
                description=i.description,
                tags=i.tags or [],
                topics=i.topics or [],
                authority=i.authority,
                enabled=i.enabled,
                priority=i.priority,
                metadata=i.metadata,
                sort_order=i.sort_order,
            )
            for i in preview.items
        ],
        errors=preview.errors,
        warnings=preview.warnings,
        source_filename=preview.source_filename,
    )


async def import_preview_zip(
    data: bytes,
    source_filename: Optional[str] = None,
) -> CollectionImportPreviewResponse:
    preview = extract_collection_zip(data, source_filename=source_filename)
    return _preview_to_response(preview)


async def import_confirm(
    body: CollectionImportConfirmRequest,
) -> CollectionDetailResponse:
    if not body.name.strip():
        raise InvalidInputError("Collection name is required")
    payload = CollectionCreateRequest(
        name=body.name,
        slug=body.slug,
        description=body.description,
        version=body.version,
        tags=body.tags,
        use_when=body.use_when,
        visibility=body.visibility,
        status=body.status,
        selection=body.selection,
        manifest_extra=body.manifest_extra,
        items=body.items,
    )
    created = await create_collection(payload)
    if body.manifest_raw.strip():
        collection = await Collection.get(created.id)
        if collection:
            collection.manifest_raw = body.manifest_raw
            await collection.save()
    return await get_collection(created.id)


async def export_collection_zip(collection_id: str) -> bytes:
    collection = await Collection.get(collection_id)
    if not collection:
        raise NotFoundError(f"Collection not found: {collection_id}")
    items = await collection.get_items()
    return build_collection_zip(collection, items)
