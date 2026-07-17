"""End-to-end architectural drawing extraction pipeline."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from loguru import logger

from construction_os.config import DRAWING_EXTRACTION_FOLDER
from construction_os.database.repository import repo_update
from construction_os.drawing import repository as drawing_repo
from construction_os.drawing.config import (
    STATUS_COMPLETED,
    STATUS_EXTRACTING,
    STATUS_FAILED,
    STATUS_INSPECTING,
    STATUS_PARTIAL,
    STATUS_PUBLISHING,
    STATUS_QUEUED,
    STATUS_SKIPPED,
    STATUS_VALIDATING,
    DrawingExtractionConfig,
    load_drawing_extraction_config,
)
from construction_os.drawing.deterministic import (
    classify_page_deterministic,
    detect_regions_heuristic,
    extract_page_content,
    extract_sheet_metadata,
)
from construction_os.drawing.embeddings import publish_drawing_embeddings
from construction_os.drawing.kg_publish import publish_drawing_knowledge_graph
from construction_os.drawing.normalize import normalize_and_dedupe
from construction_os.drawing.pdf_inspect import (
    compute_file_hash,
    inspect_page,
    open_pdf,
    resolve_source_pdf_path,
)
from construction_os.drawing.render import crop_region_asset, render_page_assets
from construction_os.drawing.semantic import build_semantic_records
from construction_os.drawing.types import DrawingItemDraft
from construction_os.drawing.validate import validate_page_extraction
from construction_os.drawing.vision import (
    CLASSIFICATION_SCHEMA,
    get_vision_client,
)
from construction_os.domain.project import Source


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _item_to_row(
    item: DrawingItemDraft,
    *,
    run_id: str,
    source_id: str,
    page_id: str,
) -> Dict[str, Any]:
    return {
        "run_id": run_id,
        "source_id": source_id,
        "page_id": page_id,
        "stable_id": item.stable_id,
        "item_type": item.item_type,
        "subtype": item.subtype,
        "label": item.label,
        "properties": item.properties,
        "raw_text": item.raw_text,
        "bbox_pdf": item.bbox_pdf.model_dump() if item.bbox_pdf else None,
        "bbox_norm": item.bbox_norm.model_dump() if item.bbox_norm else None,
        "evidence_crop": item.evidence_crop,
        "confidence": item.confidence,
        "confidence_band": item.confidence_band,
        "extraction_method": item.extraction_method,
        "verification_status": item.verification_status,
        "model_version": item.model_version,
        "warnings": item.warnings,
    }


async def run_drawing_extraction(
    *,
    source_id: str,
    project_id: Optional[str] = None,
    force: bool = False,
    command_id: Optional[str] = None,
    run_id: Optional[str] = None,
    config: Optional[DrawingExtractionConfig] = None,
    publish: bool = True,
) -> Dict[str, Any]:
    """
    Execute the full drawing extraction sequence for one source.

    Does not modify source.full_text, source_embedding, or source pipeline_stage.
    """
    cfg = config or load_drawing_extraction_config()
    source = await Source.get(source_id)
    if not source:
        raise ValueError(f"Source not found: {source_id}")

    file_path = None
    if source.asset and source.asset.file_path:
        file_path = source.asset.file_path
    pdf_path = resolve_source_pdf_path(file_path)
    file_hash = compute_file_hash(pdf_path)

    # Skip unchanged unless forced
    if not force:
        existing = await drawing_repo.find_completed_run_by_hash(source_id, file_hash)
        if existing and existing.get("active"):
            logger.info(
                "Skipping drawing extraction for {} — active run exists for hash",
                source_id,
            )
            return {
                "success": True,
                "skipped": True,
                "run_id": str(existing.get("id")),
                "status": STATUS_SKIPPED,
                "message": "Unchanged file; use force=true to rerun",
            }

    output_dir = Path(DRAWING_EXTRACTION_FOLDER) / source_id.replace(":", "_") / (
        run_id.replace(":", "_") if run_id else file_hash[:12]
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    if run_id:
        run = await drawing_repo.get_run(run_id)
        if not run:
            raise ValueError(f"Run not found: {run_id}")
        await drawing_repo.update_run(
            run_id,
            status=STATUS_INSPECTING,
            command_id=command_id,
            output_dir=str(output_dir),
            started_at=_now(),
            errors=[],
        )
    else:
        run = await drawing_repo.create_run(
            source_id=source_id,
            project_id=project_id,
            file_hash=file_hash,
            status=STATUS_INSPECTING,
            extraction_model=f"{cfg.extraction_provider}:{cfg.extraction_model}",
            verification_model=f"{cfg.verification_provider}:{cfg.verification_model}",
            embedding_model=cfg.embedding_model_hint,
            force=force,
            command_id=command_id,
            output_dir=str(output_dir),
        )
        run_id = str(run["id"])

    errors: List[Dict[str, Any]] = []
    all_items: List[DrawingItemDraft] = []
    all_rels = []
    all_conflicts: List[Dict[str, Any]] = []
    all_warnings: List[Dict[str, Any]] = []
    semantic_records: List[Dict[str, Any]] = []
    drawing_page_count = 0
    page_count = 0

    try:
        doc = open_pdf(pdf_path)
        page_count = len(doc)
        await drawing_repo.update_run(
            run_id,
            page_count=page_count,
            status=STATUS_EXTRACTING,
            stats={
                "pages_processed": 0,
                "page_count": page_count,
                "drawing_pages_found": 0,
                "items_extracted": 0,
                "semantic_records": 0,
            },
        )

        vision = get_vision_client(cfg)
        filename = pdf_path.name
        source_title = source.title or ""

        for page_index in range(page_count):
            page = doc[page_index]
            page_dir = output_dir / f"page_{page_index:04d}"
            page_dir.mkdir(parents=True, exist_ok=True)

            evidence = inspect_page(page, page_index)
            # Cap stored path list size in DB
            stored_evidence = dict(evidence)
            if len(stored_evidence.get("paths") or []) > 200:
                stored_evidence["paths"] = stored_evidence["paths"][:200]
                stored_evidence["paths_truncated"] = True
            if len(stored_evidence.get("words") or []) > 2000:
                stored_evidence["words"] = stored_evidence["words"][:2000]
                stored_evidence["words_truncated"] = True

            renders = render_page_assets(
                page,
                page_dir,
                page_dpi=cfg.page_render_dpi,
                thumbnail_dpi=cfg.thumbnail_dpi,
                dense_crop_dpi=cfg.dense_crop_dpi,
                crop_overlap=cfg.crop_overlap,
                include_grid_crops=True,
            )

            classification = classify_page_deterministic(
                evidence,
                filename=filename,
                source_title=source_title,
            )
            raw_model: Dict[str, Any] = {}

            # Optional vision classification pass (enhancement; deterministic is primary)
            if cfg.use_vision:
                try:
                    prompt = (
                        "Classify this architectural drawing page. "
                        "Use the image and this PDF text excerpt.\n\n"
                        f"Filename: {filename}\nTitle: {source_title}\n"
                        f"PDF text (excerpt):\n{str(evidence.get('plain_text') or '')[:3500]}\n"
                        "Return structured classification. Never invent sheet numbers."
                    )
                    vision_result = await vision.structured_extract(
                        prompt=prompt,
                        schema=CLASSIFICATION_SCHEMA,
                        image_paths=[renders["render_path"]],
                        model=cfg.extraction_model,
                        provider=cfg.extraction_provider,
                    )
                    raw_model["classification"] = vision_result
                    if vision_result.get("is_drawing") is True and not classification.is_drawing:
                        classification.is_drawing = True
                    if vision_result.get("sheet_number") and not classification.sheet_number:
                        classification.sheet_number = str(vision_result["sheet_number"])
                    if vision_result.get("sheet_title") and not classification.sheet_title:
                        classification.sheet_title = str(vision_result["sheet_title"])
                    if vision_result.get("drawing_types"):
                        for dt in vision_result["drawing_types"]:
                            if dt not in classification.drawing_types:
                                classification.drawing_types.append(str(dt))
                    if vision_result.get("discipline") and classification.discipline == "unknown":
                        classification.discipline = str(vision_result["discipline"])
                except Exception as exc:
                    logger.warning("Vision classification failed page {}: {}", page_index, exc)
                    errors.append(
                        {
                            "page_index": page_index,
                            "stage": "classification",
                            "error": str(exc),
                        }
                    )

            page_row = await drawing_repo.create_page(
                {
                    "run_id": run_id,
                    "source_id": source_id,
                    "page_index": page_index,
                    "page_label": evidence.get("page_label"),
                    "width": evidence.get("width"),
                    "height": evidence.get("height"),
                    "rotation": evidence.get("rotation"),
                    "is_drawing": classification.is_drawing,
                    "discipline": classification.discipline,
                    "sheet_number": classification.sheet_number,
                    "sheet_title": classification.sheet_title,
                    "drawing_types": classification.drawing_types,
                    "classification_confidence": classification.confidence,
                    "page_kind": evidence.get("page_kind"),
                    "render_path": renders.get("render_path"),
                    "thumbnail_path": renders.get("thumbnail_path"),
                    "deterministic_evidence": {
                        "word_count": evidence.get("word_count"),
                        "path_count": evidence.get("path_count"),
                        "image_count": evidence.get("image_count"),
                        "text_coverage": evidence.get("text_coverage"),
                        "page_kind": evidence.get("page_kind"),
                        "plain_text_excerpt": str(evidence.get("plain_text") or "")[:8000],
                        "words": stored_evidence.get("words"),
                        "blocks": stored_evidence.get("blocks"),
                        "images": stored_evidence.get("images"),
                        "paths": stored_evidence.get("paths"),
                    },
                    "classification": classification.model_dump(),
                    "sheet_metadata": extract_sheet_metadata(evidence, classification)
                    if classification.is_drawing
                    else {},
                    "raw_model_responses": raw_model,
                    "page_summary": None,
                    "warnings": [],
                }
            )
            page_id = str(page_row["id"])

            async def _write_page_progress() -> None:
                await drawing_repo.update_run(
                    run_id,
                    status=STATUS_EXTRACTING,
                    drawing_page_count=drawing_page_count,
                    stats={
                        "pages_processed": page_index + 1,
                        "page_count": page_count,
                        "drawing_pages_found": drawing_page_count,
                        "items_extracted": len(all_items),
                        "semantic_records": len(semantic_records),
                        "current_page_index": page_index,
                        "current_sheet": classification.sheet_number,
                        "current_title": classification.sheet_title,
                    },
                )

            if not classification.is_drawing:
                await _write_page_progress()
                continue

            drawing_page_count += 1
            regions = detect_regions_heuristic(evidence, classification)
            region_id_by_type: Dict[str, str] = {}
            for idx, region in enumerate(regions):
                crop_path = crop_region_asset(
                    page,
                    region.bbox_pdf,
                    page_dir / "regions" / f"{region.region_type}_{idx}.png",
                    dpi=cfg.dense_crop_dpi,
                )
                region.crop_path = crop_path
                row = await drawing_repo.create_region(
                    {
                        "run_id": run_id,
                        "page_id": page_id,
                        "region_type": region.region_type,
                        "bbox_pdf": region.bbox_pdf.model_dump(),
                        "bbox_norm": region.bbox_norm.model_dump(),
                        "crop_path": crop_path,
                        "confidence": region.confidence,
                        "detection_method": region.detection_method,
                    }
                )
                region_id_by_type[region.region_type] = str(row["id"])

            items, rels, unclassified = extract_page_content(
                evidence, classification, page_index=page_index
            )
            items.extend(unclassified)

            items, rels, conflicts = normalize_and_dedupe(items, rels)
            items, page_warnings = validate_page_extraction(
                classification=classification,
                items=items,
                evidence=evidence,
            )
            all_conflicts.extend(conflicts)
            all_warnings.extend(page_warnings)

            for item in items:
                await drawing_repo.create_item(
                    _item_to_row(item, run_id=run_id, source_id=source_id, page_id=page_id)
                )
            for rel in rels:
                await drawing_repo.create_relationship(
                    {
                        "run_id": run_id,
                        "source_id": source_id,
                        "relationship_type": rel.relationship_type,
                        "from_item_id": rel.from_item_id,
                        "to_item_id": rel.to_item_id,
                        "from_label": rel.from_label,
                        "to_label": rel.to_label,
                        "properties": rel.properties,
                        "confidence": rel.confidence,
                        "evidence": rel.evidence,
                    }
                )

            all_items.extend(items)
            all_rels.extend(rels)

            page_semantics = build_semantic_records(
                classification=classification,
                items=items,
                page_index=page_index,
                page_id=page_id,
            )
            for sem in page_semantics:
                saved = await drawing_repo.create_semantic_record(
                    {
                        "run_id": run_id,
                        "project_id": project_id,
                        "source_id": source_id,
                        "page_id": page_id,
                        "record_type": sem["record_type"],
                        "title": sem.get("title"),
                        "content": sem["content"],
                        "discipline": sem.get("discipline"),
                        "sheet_number": sem.get("sheet_number"),
                        "drawing_type": sem.get("drawing_type"),
                        "item_ids": sem.get("item_ids"),
                        "confidence": sem.get("confidence"),
                        "confidence_band": sem.get("confidence_band"),
                        "verification_status": sem.get("verification_status"),
                        "bbox_norm": sem.get("bbox_norm"),
                        "evidence_crop": sem.get("evidence_crop"),
                        "metadata": sem.get("metadata"),
                    }
                )
                sem["id"] = str(saved["id"])
                semantic_records.append(sem)

            summary_bits = [
                classification.sheet_number or "",
                classification.sheet_title or "",
                f"{len(items)} items",
            ]
            await repo_update(
                "drawing_page",
                page_id,
                {
                    "page_summary": " — ".join(x for x in summary_bits if x),
                    "warnings": page_warnings,
                },
            )
            await _write_page_progress()

        doc.close()

        await drawing_repo.update_run(
            run_id,
            status=STATUS_VALIDATING,
            drawing_page_count=drawing_page_count,
            stats={
                "pages_processed": page_count,
                "page_count": page_count,
                "drawing_pages_found": drawing_page_count,
                "items_extracted": len(all_items),
                "semantic_records": len(semantic_records),
            },
        )

        if publish:
            await drawing_repo.update_run(run_id, status=STATUS_PUBLISHING)
            emb_stats = {"embedded": 0}
            kg_stats: Dict[str, Any] = {}
            if cfg.publish_embeddings and semantic_records:
                emb_stats = await publish_drawing_embeddings(
                    run_id=run_id,
                    source_id=source_id,
                    project_id=project_id,
                    semantic_records=semantic_records,
                    embedding_model_hint=cfg.embedding_model_hint,
                )
            if cfg.publish_knowledge_graph and project_id and all_items:
                try:
                    kg_stats = await publish_drawing_knowledge_graph(
                        items=all_items,
                        relationships=all_rels,
                        source_id=source_id,
                        project_id=project_id,
                        run_id=run_id,
                    )
                except Exception as exc:
                    logger.error("Drawing KG publish failed: {}", exc)
                    errors.append({"stage": "kg_publish", "error": str(exc)})
        else:
            emb_stats = {"embedded": 0}
            kg_stats = {}

        status = STATUS_COMPLETED
        if errors and drawing_page_count > 0:
            status = STATUS_PARTIAL
        elif drawing_page_count == 0 and page_count > 0:
            status = STATUS_PARTIAL
            errors.append(
                {
                    "stage": "classification",
                    "error": "No pages classified as drawings",
                }
            )

        counts: Dict[str, int] = {}
        for item in all_items:
            counts[item.item_type] = counts.get(item.item_type, 0) + 1

        stats = {
            "page_count": page_count,
            "drawing_page_count": drawing_page_count,
            "item_count": len(all_items),
            "item_counts_by_type": counts,
            "relationship_count": len(all_rels),
            "semantic_record_count": len(semantic_records),
            "conflicts": len(all_conflicts),
            "warnings": len(all_warnings),
            "embeddings": emb_stats,
            "knowledge_graph": kg_stats,
        }

        await drawing_repo.update_run(
            run_id,
            status=status,
            finished_at=_now(),
            errors=errors,
            page_count=page_count,
            drawing_page_count=drawing_page_count,
            stats=stats,
        )

        # Activate successful runs for retrieval
        if status in {STATUS_COMPLETED, STATUS_PARTIAL} and drawing_page_count > 0:
            await drawing_repo.activate_run(run_id, source_id)

        return {
            "success": status in {STATUS_COMPLETED, STATUS_PARTIAL},
            "run_id": run_id,
            "status": status,
            "stats": stats,
            "errors": errors,
        }

    except Exception as exc:
        logger.exception("Drawing extraction failed for {}: {}", source_id, exc)
        await drawing_repo.update_run(
            run_id,
            status=STATUS_FAILED,
            finished_at=_now(),
            errors=[{"stage": "pipeline", "error": str(exc)}],
        )
        # Do NOT touch source pipeline status
        return {
            "success": False,
            "run_id": run_id,
            "status": STATUS_FAILED,
            "error": str(exc),
        }


async def queue_drawing_extraction_jobs(
    *,
    source_ids: List[str],
    project_id: Optional[str],
    force: bool = False,
) -> List[Dict[str, Any]]:
    """Create queued runs and submit surreal-commands jobs for each source."""
    from surreal_commands import submit_command

    results: List[Dict[str, Any]] = []
    cfg = load_drawing_extraction_config()

    for source_id in source_ids:
        source = await Source.get(source_id)
        if not source:
            results.append(
                {
                    "source_id": source_id,
                    "success": False,
                    "error": "Source not found",
                }
            )
            continue
        try:
            path = resolve_source_pdf_path(
                source.asset.file_path if source.asset else None
            )
        except (ValueError, FileNotFoundError) as exc:
            results.append(
                {
                    "source_id": source_id,
                    "success": False,
                    "error": str(exc),
                }
            )
            continue

        file_hash = compute_file_hash(path)
        run = await drawing_repo.create_run(
            source_id=source_id,
            project_id=project_id,
            file_hash=file_hash,
            status=STATUS_QUEUED,
            extraction_model=f"{cfg.extraction_provider}:{cfg.extraction_model}",
            verification_model=f"{cfg.verification_provider}:{cfg.verification_model}",
            embedding_model=cfg.embedding_model_hint,
            force=force,
        )
        run_id = str(run["id"])
        try:
            import commands  # noqa: F401
        except ImportError:
            pass
        cmd_id = submit_command(
            "construction_os",
            "extract_architectural_drawings",
            {
                "source_id": source_id,
                "project_id": project_id,
                "run_id": run_id,
                "force": force,
            },
        )
        command_id = str(cmd_id) if cmd_id else None
        if command_id:
            await drawing_repo.update_run(run_id, command_id=command_id)
        results.append(
            {
                "source_id": source_id,
                "success": True,
                "run_id": run_id,
                "command_id": command_id,
                "status": STATUS_QUEUED,
            }
        )
    return results
