import asyncio
import os
from pathlib import Path
from typing import Any, List, Optional, Tuple

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse, Response
from loguru import logger
from surreal_commands import execute_command_sync, get_command_status

from api.command_service import CommandService
from api.models import (
    AssetModel,
    IngestTextSourceRequest,
    SourceCreate,
    SourceListResponse,
    SourceResponse,
    SourceStatusResponse,
    SourceUpdate,
)
from commands.source_commands import SourceProcessingInput
from construction_os.config import UPLOADS_FOLDER
from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.project import Asset, Project, Source
from construction_os.exceptions import InvalidInputError, NotFoundError
from construction_os.knowledge.pipeline import (
    ACTIVE_PIPELINE_STAGES,
    PIPELINE_EXTRACTING,
    fetched_command_status,
    heal_pipeline_stage_if_needed,
    pipeline_processing_info,
    resolve_processing_failures,
    resolve_pipeline_status,
)

router = APIRouter()


def generate_unique_filename(original_filename: str, upload_folder: str) -> str:
    """Generate unique filename like Streamlit app (append counter if file exists)."""
    file_path = Path(upload_folder)
    file_path.mkdir(parents=True, exist_ok=True)

    # Strip directory components to prevent path traversal
    safe_filename = os.path.basename(original_filename)
    if not safe_filename:
        raise ValueError("Invalid filename")

    # Split filename and extension
    stem = Path(safe_filename).stem
    suffix = Path(safe_filename).suffix

    # Check if file exists and generate unique name
    counter = 0
    while True:
        if counter == 0:
            new_filename = safe_filename
        else:
            new_filename = f"{stem} ({counter}){suffix}"

        full_path = file_path / new_filename
        # Verify resolved path stays within upload folder
        resolved = full_path.resolve()
        if not str(resolved).startswith(str(file_path.resolve()) + os.sep):
            raise ValueError("Invalid filename: path traversal detected")
        if not resolved.exists():
            return str(resolved)
        counter += 1


async def save_uploaded_file(upload_file: UploadFile) -> str:
    """Save uploaded file to uploads folder and return file path."""
    if not upload_file.filename:
        raise ValueError("No filename provided")

    # Generate unique filename
    file_path = generate_unique_filename(upload_file.filename, UPLOADS_FOLDER)

    try:
        # Save file
        with open(file_path, "wb") as f:
            content = await upload_file.read()
            f.write(content)

        logger.info(f"Saved uploaded file to: {file_path}")
        return file_path
    except Exception as e:
        logger.error(f"Failed to save uploaded file: {e}")
        # Clean up partial file if it exists
        if os.path.exists(file_path):
            os.unlink(file_path)
        raise


def parse_source_form_data(
    type: str = Form(...),
    project_id: Optional[str] = Form(None),
    projects: Optional[str] = Form(None),  # JSON string of Project IDs
    url: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    artifacts: Optional[str] = Form(None),  # JSON string of Artifact IDs
    embed: str = Form("false"),  # Accept as string, convert to bool
    delete_source: str = Form("false"),  # Accept as string, convert to bool
    async_processing: str = Form("false"),  # Accept as string, convert to bool
    file: Optional[UploadFile] = File(None),
) -> tuple[SourceCreate, Optional[UploadFile]]:
    """Parse form data into SourceCreate model and return upload file separately."""
    import json

    # Convert string booleans to actual booleans
    def str_to_bool(value: str) -> bool:
        return value.lower() in ("true", "1", "yes", "on")

    embed_bool = str_to_bool(embed)
    delete_source_bool = str_to_bool(delete_source)
    async_processing_bool = str_to_bool(async_processing)

    # Parse JSON strings
    projects_list = None
    if projects:
        try:
            projects_list = json.loads(projects)
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in projects field: {projects}")
            raise ValueError("Invalid JSON in projects field")

    artifacts_list = []
    if artifacts:
        try:
            artifacts_list = json.loads(artifacts)
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in artifacts field: {artifacts}")
            raise ValueError("Invalid JSON in artifacts field")

    # Create SourceCreate instance
    try:
        source_data = SourceCreate(
            type=type,
            project_id=project_id,
            projects=projects_list,
            url=url,
            content=content,
            title=title,
            file_path=None,  # Will be set later if file is uploaded
            artifacts=[],  # ignored
            embed=embed_bool,
            delete_source=delete_source_bool,
            async_processing=async_processing_bool,
        )
        pass  # SourceCreate instance created successfully
    except Exception as e:
        logger.error(f"Failed to create SourceCreate instance: {e}")
        raise

    return source_data, file


@router.get("/sources", response_model=List[SourceListResponse])
async def get_sources(
    project_id: Optional[str] = Query(None, description="Filter by Project ID"),
    limit: int = Query(
        50, ge=1, le=100, description="Number of sources to return (1-100)"
    ),
    offset: int = Query(0, ge=0, description="Number of sources to skip"),
    sort_by: str = Query(
        "updated", description="Field to sort by (created or updated)"
    ),
    sort_order: str = Query("desc", description="Sort order (asc or desc)"),
):
    """Get sources with pagination and sorting support."""
    try:
        # Validate sort parameters
        if sort_by not in ["created", "updated"]:
            raise HTTPException(
                status_code=400, detail="sort_by must be 'created' or 'updated'"
            )
        if sort_order.lower() not in ["asc", "desc"]:
            raise HTTPException(
                status_code=400, detail="sort_order must be 'asc' or 'desc'"
            )

        # Build ORDER BY clause
        order_clause = f"ORDER BY {sort_by} {sort_order.upper()}"

        # Build the query
        if project_id:
            # Verify Project exists first
            project = await Project.get(project_id)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")

            # Query sources for specific Project - include command fields with FETCH
            query = f"""
                SELECT id, asset, created, title, updated, topics, command,
                embed_command, kg_command, pipeline_stage, processing_failures,
                (SELECT status, error_message, error_type, started_at, finished_at, updated, command_id
                 FROM kg_extraction_run WHERE source_id = $parent.id
                 ORDER BY started_at DESC LIMIT 1)[0] AS latest_kg_run,
                (SELECT VALUE id FROM source_embedding WHERE source = $parent.id LIMIT 1) != [] AS embedded,
                (SELECT status, created FROM drawing_extraction_run WHERE source_id = $parent.id
                 ORDER BY created DESC LIMIT 1)[0] AS latest_drawing_run
                FROM (select value in from reference where out=$project_id)
                {order_clause}
                LIMIT $limit START $offset
                FETCH command, embed_command, kg_command
            """
            result = await repo_query(
                query,
                {
                    "project_id": ensure_record_id(project_id),
                    "limit": limit,
                    "offset": offset,
                },
            )
        else:
            # Query all sources - include command fields with FETCH
            query = f"""
                SELECT id, asset, created, title, updated, topics, command,
                embed_command, kg_command, pipeline_stage, processing_failures,
                (SELECT status, error_message, error_type, started_at, finished_at, updated, command_id
                 FROM kg_extraction_run WHERE source_id = $parent.id
                 ORDER BY started_at DESC LIMIT 1)[0] AS latest_kg_run,
                (SELECT VALUE id FROM source_embedding WHERE source = $parent.id LIMIT 1) != [] AS embedded,
                (SELECT status, created FROM drawing_extraction_run WHERE source_id = $parent.id
                 ORDER BY created DESC LIMIT 1)[0] AS latest_drawing_run
                FROM source
                {order_clause}
                LIMIT $limit START $offset
                FETCH command, embed_command, kg_command
            """
            result = await repo_query(query, {"limit": limit, "offset": offset})

        # Convert result to response model
        # Command data is already fetched via FETCH command clause
        response_list = []
        for row in result:
            command = row.get("command")
            command_id = None
            status = None
            processing_info = None

            # Extract status from fetched command object (already resolved by FETCH)
            if command and isinstance(command, dict):
                command_id = str(command.get("id")) if command.get("id") else None
                status = command.get("status")
                # Extract execution metadata from nested result structure
                result_data = command.get("result")
                execution_metadata = (
                    result_data.get("execution_metadata", {})
                    if isinstance(result_data, dict)
                    else {}
                )
                processing_info = {
                    "started_at": execution_metadata.get("started_at"),
                    "completed_at": execution_metadata.get("completed_at"),
                    "error": command.get("error_message"),
                }
            elif command:
                # Command exists but FETCH failed to resolve it (broken reference)
                command_id = str(command)
                status = "unknown"

            pipeline_stage = row.get("pipeline_stage")
            embed_status, has_embed = fetched_command_status(row.get("embed_command"))
            kg_status, has_kg = fetched_command_status(row.get("kg_command"))
            status, stage, _message = resolve_pipeline_status(
                extract_status=status,
                pipeline_stage=pipeline_stage,
                embed_command_status=embed_status,
                kg_command_status=kg_status,
                has_embed_command=has_embed,
                has_kg_command=has_kg,
            )
            source_row_id = str(row["id"])
            await heal_pipeline_stage_if_needed(
                source_row_id,
                current_stage=pipeline_stage,
                resolved_stage=stage,
            )
            processing_info = pipeline_processing_info(processing_info, stage)
            processing_failures = resolve_processing_failures(
                row.get("processing_failures"),
                embed_command=row.get("embed_command"),
                kg_command=row.get("kg_command"),
                kg_run=row.get("latest_kg_run"),
            )
            failure_details_unavailable = (
                stage == "failed" and not processing_failures
            )

            latest_drawing = row.get("latest_drawing_run")
            drawing_status = None
            if isinstance(latest_drawing, dict) and latest_drawing.get("status") is not None:
                drawing_status = str(latest_drawing["status"])

            response_list.append(
                SourceListResponse(
                    id=row["id"],
                    title=row.get("title"),
                    topics=row.get("topics") or [],
                    asset=AssetModel(
                        file_path=row["asset"].get("file_path")
                        if row.get("asset")
                        else None,
                        url=row["asset"].get("url") if row.get("asset") else None,
                    )
                    if row.get("asset")
                    else None,
                    embedded=row.get("embedded", False),
                    embedded_chunks=0,  # Not needed in list view
                    created=str(row["created"]),
                    updated=str(row["updated"]),
                    # Status fields from fetched command + pipeline stage
                    command_id=command_id,
                    status=status,
                    processing_info=processing_info,
                    pipeline_stage=pipeline_stage if stage != "failed" else stage,
                    stage=stage,
                    kg_status=kg_status,
                    drawing_status=drawing_status,
                    processing_failures=processing_failures,
                    failure_details_unavailable=failure_details_unavailable,
                )
            )

        return response_list
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sources: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching sources: {str(e)}")


@router.post("/sources", response_model=SourceResponse)
async def create_source(
    form_data: tuple[SourceCreate, Optional[UploadFile]] = Depends(
        parse_source_form_data
    ),
):
    """Create a new source with support for both JSON and multipart form data."""
    source_data, upload_file = form_data

    # Initialize file_path before try block so exception handlers can reference it
    file_path = None

    try:
        # Verify all specified projects exist (backward compatibility support)
        for project_id in source_data.projects or []:
            project = await Project.get(project_id)
            if not project:
                raise HTTPException(
                    status_code=404, detail=f"Project {project_id} not found"
                )

        # Handle file upload if provided
        if upload_file and source_data.type == "upload":
            try:
                file_path = await save_uploaded_file(upload_file)
            except Exception as e:
                logger.error(f"File upload failed: {e}")
                raise HTTPException(
                    status_code=400, detail=f"File upload failed: {str(e)}"
                )

        # Prepare content_state for processing
        content_state: dict[str, Any] = {}

        if source_data.type == "link":
            if not source_data.url:
                raise HTTPException(
                    status_code=400, detail="URL is required for link type"
                )
            content_state["url"] = source_data.url
        elif source_data.type == "upload":
            # Use uploaded file path or provided file_path (backward compatibility)
            final_file_path = file_path or source_data.file_path
            if not final_file_path:
                raise HTTPException(
                    status_code=400,
                    detail="File upload or file_path is required for upload type",
                )
            # Validate file_path is within the uploads directory to prevent LFI
            uploads_resolved = Path(UPLOADS_FOLDER).resolve()
            file_resolved = Path(final_file_path).resolve()
            if not str(file_resolved).startswith(str(uploads_resolved) + os.sep):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid file path: must be within the uploads directory",
                )
            content_state["file_path"] = final_file_path
            content_state["delete_source"] = source_data.delete_source
        elif source_data.type == "text":
            if not source_data.content:
                raise HTTPException(
                    status_code=400, detail="Content is required for text type"
                )
            content_state["content"] = source_data.content
        else:
            raise HTTPException(
                status_code=400,
                detail="Invalid source type. Must be link, upload, or text",
            )

        # Artifacts list ignored — no longer applied during source ingest
        artifact_ids: list = []

        # Branch based on processing mode
        if source_data.async_processing:
            # ASYNC PATH: Create source record first, then queue command
            logger.info("Using async processing path")

            # Create source record with asset - let SurrealDB generate the ID
            # Persist asset before save so it's available for retry if processing fails
            if source_data.type == "link":
                source_asset = Asset(url=source_data.url)
            elif source_data.type == "upload":
                source_asset = Asset(file_path=file_path or source_data.file_path)
            else:
                source_asset = None

            source = Source(
                title=source_data.title or "Processing...",
                topics=[],
                asset=source_asset,
                pipeline_stage=PIPELINE_EXTRACTING,
            )
            await source.save()

            # Add source to projects immediately so it appears in the UI
            # The source_graph will skip adding duplicates
            for project_id in source_data.projects or []:
                await source.add_to_project(project_id)

            try:
                # Import command modules to ensure they're registered
                import commands.source_commands  # noqa: F401

                # Always embed so vector search + knowledge graph run after upload
                command_input = SourceProcessingInput(
                    source_id=str(source.id),
                    content_state=content_state,
                    project_ids=source_data.projects,
                    artifacts=artifact_ids,
                    embed=True,
                )

                command_id = await CommandService.submit_command_job(
                    "construction_os",  # app name
                    "process_source",  # command name
                    command_input.model_dump(),
                )

                logger.info(f"Submitted async processing command: {command_id}")

                # Update source with command reference immediately
                # command_id already includes 'command:' prefix
                source.command = ensure_record_id(command_id)
                await source.save()

                # Return source with command info
                return SourceResponse(
                    id=source.id or "",
                    title=source.title,
                    topics=source.topics or [],
                    asset=None,  # Will be populated after processing
                    full_text=None,  # Will be populated after processing
                    embedded=False,  # Will be updated after processing
                    embedded_chunks=0,
                    created=str(source.created),
                    updated=str(source.updated),
                    command_id=command_id,
                    status="new",
                    processing_info={"async": True, "queued": True},
                )

            except Exception as e:
                logger.error(f"Failed to submit async processing command: {e}")
                # Clean up source record on command submission failure
                try:
                    await source.delete()
                except Exception:
                    pass
                # Clean up uploaded file if we created it
                if file_path and upload_file:
                    try:
                        os.unlink(file_path)
                    except Exception:
                        pass
                raise HTTPException(
                    status_code=500, detail=f"Failed to queue processing: {str(e)}"
                )

        else:
            # SYNC PATH: Execute synchronously using execute_command_sync
            logger.info("Using sync processing path")

            try:
                # Import command modules to ensure they're registered
                import commands.source_commands  # noqa: F401

                # Create source record - let SurrealDB generate the ID
                source = Source(
                    title=source_data.title or "Processing...",
                    topics=[],
                    pipeline_stage=PIPELINE_EXTRACTING,
                )
                await source.save()

                # Add source to projects immediately so it appears in the UI
                # The source_graph will skip adding duplicates
                for project_id in source_data.projects or []:
                    await source.add_to_project(project_id)

                # Execute command synchronously
                command_input = SourceProcessingInput(
                    source_id=str(source.id),
                    content_state=content_state,
                    project_ids=source_data.projects,
                    artifacts=artifact_ids,
                    embed=True,
                )

                # Run in thread pool to avoid blocking the event loop
                # execute_command_sync uses asyncio.run() internally which can't
                # be called from an already-running event loop (FastAPI)
                result = await asyncio.to_thread(
                    execute_command_sync,
                    "construction_os",  # app name
                    "process_source",  # command name
                    command_input.model_dump(),
                    timeout=300,  # 5 minute timeout for sync processing
                )

                if not result.is_success():
                    logger.error(f"Sync processing failed: {result.error_message}")
                    # Clean up source record
                    try:
                        await source.delete()
                    except Exception:
                        pass
                    # Clean up uploaded file if we created it
                    if file_path and upload_file:
                        try:
                            os.unlink(file_path)
                        except Exception:
                            pass
                    raise HTTPException(
                        status_code=500,
                        detail=f"Processing failed: {result.error_message}",
                    )

                # Get the processed source
                if not source.id:
                    raise HTTPException(status_code=500, detail="Source ID is missing")
                processed_source = await Source.get(source.id)
                if not processed_source:
                    raise HTTPException(
                        status_code=500, detail="Processed source not found"
                    )

                embedded_chunks = await processed_source.get_embedded_chunks()
                return SourceResponse(
                    id=processed_source.id or "",
                    title=processed_source.title,
                    topics=processed_source.topics or [],
                    asset=AssetModel(
                        file_path=processed_source.asset.file_path
                        if processed_source.asset
                        else None,
                        url=processed_source.asset.url
                        if processed_source.asset
                        else None,
                    )
                    if processed_source.asset
                    else None,
                    full_text=processed_source.full_text,
                    embedded=embedded_chunks > 0,
                    embedded_chunks=embedded_chunks,
                    created=str(processed_source.created),
                    updated=str(processed_source.updated),
                    # No command_id or status for sync processing (legacy behavior)
                )

            except Exception as e:
                logger.error(f"Sync processing failed: {e}")
                # Clean up uploaded file if we created it
                if file_path and upload_file:
                    try:
                        os.unlink(file_path)
                    except Exception:
                        pass
                raise

    except HTTPException:
        # Clean up uploaded file on HTTP exceptions if we created it
        if file_path and upload_file:
            try:
                os.unlink(file_path)
            except Exception:
                pass
        raise
    except InvalidInputError as e:
        # Clean up uploaded file on validation errors if we created it
        if file_path and upload_file:
            try:
                os.unlink(file_path)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating source: {str(e)}")
        # Clean up uploaded file on unexpected errors if we created it
        if file_path and upload_file:
            try:
                os.unlink(file_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Error creating source: {str(e)}")


@router.post("/sources/json", response_model=SourceResponse)
async def create_source_json(source_data: SourceCreate):
    """Create a new source using JSON payload (legacy endpoint for backward compatibility)."""
    # Convert to form data format and call main endpoint
    form_data = (source_data, None)
    return await create_source(form_data)


@router.post("/sources/ingest-text", response_model=SourceResponse)
async def ingest_text_source(request: IngestTextSourceRequest):
    """Ingest pre-extracted text as a searchable source (promotion fast path)."""
    from api.promotion_service import promote_text_to_source

    try:
        return await promote_text_to_source(
            content=request.content,
            title=request.title,
            project_ids=request.project_ids,
            embed=request.embed,
            artifact_ids=request.artifacts or [],
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error ingesting text source: {e}")
        raise HTTPException(status_code=500, detail=f"Error ingesting text source: {e}")


async def _resolve_source_file(source_id: str) -> tuple[str, str]:
    source = await Source.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    file_path = source.asset.file_path if source.asset else None
    if not file_path:
        raise HTTPException(status_code=404, detail="Source has no file to download")

    safe_root = os.path.realpath(UPLOADS_FOLDER)
    resolved_path = os.path.realpath(file_path)

    if not resolved_path.startswith(safe_root):
        logger.warning(
            f"Blocked download outside uploads directory for source {source_id}: {resolved_path}"
        )
        raise HTTPException(status_code=403, detail="Access to file denied")

    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    filename = os.path.basename(resolved_path)
    return resolved_path, filename


def _is_source_file_available(source: Source) -> Optional[bool]:
    if not source or not source.asset or not source.asset.file_path:
        return None

    file_path = source.asset.file_path
    safe_root = os.path.realpath(UPLOADS_FOLDER)
    resolved_path = os.path.realpath(file_path)

    if not resolved_path.startswith(safe_root):
        return False

    return os.path.exists(resolved_path)


@router.get("/sources/{source_id}", response_model=SourceResponse)
async def get_source(source_id: str):
    """Get a specific source by ID."""
    try:
        source = await Source.get(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Get status information if command exists
        status = None
        processing_info = None
        if source.command:
            try:
                status = await source.get_status()
                processing_info = await source.get_processing_progress()
            except Exception as e:
                logger.warning(f"Failed to get status for source {source_id}: {e}")
                status = "unknown"

        embedded_chunks = await source.get_embedded_chunks()
        embed_command, _ = await _child_command_details(
            getattr(source, "embed_command", None)
        )
        kg_command, _ = await _child_command_details(
            getattr(source, "kg_command", None)
        )
        processing_failures = resolve_processing_failures(
            getattr(source, "processing_failures", None),
            embed_command=embed_command,
            kg_command=kg_command,
            kg_run=await _latest_kg_run(str(source.id or source_id)),
        )
        pipeline_stage = getattr(source, "pipeline_stage", None)

        # Get associated projects
        projects_query = await repo_query(
            "SELECT VALUE out FROM reference WHERE in = $source_id",
            {"source_id": ensure_record_id(source.id or source_id)},
        )
        project_ids = (
            [str(pid) for pid in projects_query] if projects_query else []
        )

        return SourceResponse(
            id=source.id or "",
            title=source.title,
            topics=source.topics or [],
            asset=AssetModel(
                file_path=source.asset.file_path if source.asset else None,
                url=source.asset.url if source.asset else None,
            )
            if source.asset
            else None,
            full_text=source.full_text,
            embedded=embedded_chunks > 0,
            embedded_chunks=embedded_chunks,
            file_available=_is_source_file_available(source),
            created=str(source.created),
            updated=str(source.updated),
            # Status fields
            command_id=str(source.command) if source.command else None,
            status=status,
            processing_info=processing_info,
            pipeline_stage=pipeline_stage,
            stage=pipeline_stage,
            processing_failures=processing_failures,
            failure_details_unavailable=(
                pipeline_stage == "failed" and not processing_failures
            ),
            # Project associations
            projects=project_ids,
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Source not found")
    except Exception as e:
        logger.error(f"Error fetching source {source_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching source: {str(e)}")


@router.head("/sources/{source_id}/download")
async def check_source_file(source_id: str):
    """Check if a source has a downloadable file."""
    try:
        await _resolve_source_file(source_id)
        return Response(status_code=200)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking file for source {source_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify file")


@router.get("/sources/{source_id}/download")
async def download_source_file(source_id: str):
    """Download the original file associated with an uploaded source."""
    try:
        resolved_path, filename = await _resolve_source_file(source_id)
        return FileResponse(
            path=resolved_path,
            filename=filename,
            media_type="application/octet-stream",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading file for source {source_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to download source file")


async def _child_command_details(
    command_ref: Any,
) -> Tuple[Optional[dict[str, Any]], bool]:
    """Resolve status and failure output for an embed/KG command link."""
    if not command_ref:
        return None, False
    try:
        status_result = await get_command_status(str(command_ref))
        if not status_result:
            return {"id": str(command_ref), "status": "unknown"}, True
        return (
            {
                "id": str(command_ref),
                "status": status_result.status or "unknown",
                "result": getattr(status_result, "result", None),
                "error_message": getattr(status_result, "error_message", None),
                "updated": str(status_result.updated)
                if getattr(status_result, "updated", None)
                else None,
            },
            True,
        )
    except Exception as e:
        logger.warning(f"Failed to get child command status for {command_ref}: {e}")
        return {"id": str(command_ref), "status": "unknown"}, True


async def _latest_kg_run(source_id: str) -> Optional[dict[str, Any]]:
    """Fetch the latest KG run for diagnostics fallback."""
    try:
        rows = await repo_query(
            """
            SELECT status, error_message, error_type, started_at, finished_at, updated, command_id
            FROM kg_extraction_run
            WHERE source_id = $source_id
            ORDER BY started_at DESC
            LIMIT 1
            """,
            {"source_id": ensure_record_id(source_id)},
        )
        return rows[0] if rows else None
    except Exception as exc:
        logger.warning(f"Failed to load KG diagnostics for {source_id}: {exc}")
        return None


@router.get("/sources/{source_id}/status", response_model=SourceStatusResponse)
async def get_source_status(source_id: str):
    """Get processing status for a source."""
    try:
        # First, verify source exists
        source = await Source.get(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        pipeline_stage = getattr(source, "pipeline_stage", None)
        embed_command, has_embed = await _child_command_details(
            getattr(source, "embed_command", None)
        )
        kg_command, has_kg = await _child_command_details(
            getattr(source, "kg_command", None)
        )
        embed_status, _ = fetched_command_status(embed_command)
        kg_status, _ = fetched_command_status(kg_command)
        processing_failures = resolve_processing_failures(
            getattr(source, "processing_failures", None),
            embed_command=embed_command,
            kg_command=kg_command,
            kg_run=await _latest_kg_run(str(source.id or source_id)),
        )
        failure_details_unavailable = (
            pipeline_stage == "failed" and not processing_failures
        )
        # Cheap existence check — avoid COUNT on every 2s poll while embedding runs.
        try:
            emb_rows = await repo_query(
                "SELECT VALUE id FROM source_embedding WHERE source = $id LIMIT 1",
                {"id": ensure_record_id(source.id or source_id)},
            )
            embedded = bool(emb_rows)
        except Exception:
            embedded = None

        # Check if this is a legacy source (no command)
        if not source.command:
            if pipeline_stage in ACTIVE_PIPELINE_STAGES:
                status, stage, message = resolve_pipeline_status(
                    extract_status="completed",
                    pipeline_stage=pipeline_stage,
                    embed_command_status=embed_status,
                    kg_command_status=kg_status,
                    has_embed_command=has_embed,
                    has_kg_command=has_kg,
                )
                await heal_pipeline_stage_if_needed(
                    str(source.id or source_id),
                    current_stage=pipeline_stage,
                    resolved_stage=stage,
                )
                return SourceStatusResponse(
                    status=status,
                    message=message,
                    processing_info=pipeline_processing_info(None, stage),
                    command_id=None,
                    stage=stage,
                    embedded=embedded,
                    kg_status=kg_status,
                    processing_failures=processing_failures,
                    failure_details_unavailable=(
                        stage == "failed" and not processing_failures
                    ),
                )
            return SourceStatusResponse(
                status=None,
                message="Legacy source (completed before async processing)",
                processing_info=None,
                command_id=None,
                stage=pipeline_stage or "completed",
                embedded=embedded,
                kg_status=kg_status,
                processing_failures=processing_failures,
                failure_details_unavailable=failure_details_unavailable,
            )

        # Get command status and processing info
        try:
            extract_status = await source.get_status()
            processing_info = await source.get_processing_progress()
            status, stage, message = resolve_pipeline_status(
                extract_status=extract_status,
                pipeline_stage=pipeline_stage,
                embed_command_status=embed_status,
                kg_command_status=kg_status,
                has_embed_command=has_embed,
                has_kg_command=has_kg,
            )
            await heal_pipeline_stage_if_needed(
                str(source.id or source_id),
                current_stage=pipeline_stage,
                resolved_stage=stage,
            )

            return SourceStatusResponse(
                status=status,
                message=message,
                processing_info=pipeline_processing_info(processing_info, stage),
                command_id=str(source.command) if source.command else None,
                stage=stage,
                embedded=embedded,
                kg_status=kg_status,
                processing_failures=processing_failures,
                failure_details_unavailable=(
                    stage == "failed" and not processing_failures
                ),
            )

        except Exception as e:
            logger.warning(f"Failed to get status for source {source_id}: {e}")
            return SourceStatusResponse(
                status="unknown",
                message="Failed to retrieve processing status",
                processing_info=None,
                command_id=str(source.command) if source.command else None,
                stage=getattr(source, "pipeline_stage", None),
                embedded=embedded,
                kg_status=kg_status,
                processing_failures=processing_failures,
                failure_details_unavailable=failure_details_unavailable,
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching status for source {source_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching source status: {str(e)}"
        )


@router.put("/sources/{source_id}", response_model=SourceResponse)
async def update_source(source_id: str, source_update: SourceUpdate):
    """Update a source."""
    try:
        source = await Source.get(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Update only provided fields
        if source_update.title is not None:
            source.title = source_update.title
        if source_update.topics is not None:
            source.topics = source_update.topics

        await source.save()

        embedded_chunks = await source.get_embedded_chunks()
        return SourceResponse(
            id=source.id or "",
            title=source.title,
            topics=source.topics or [],
            asset=AssetModel(
                file_path=source.asset.file_path if source.asset else None,
                url=source.asset.url if source.asset else None,
            )
            if source.asset
            else None,
            full_text=source.full_text,
            embedded=embedded_chunks > 0,
            embedded_chunks=embedded_chunks,
            created=str(source.created),
            updated=str(source.updated),
        )
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating source {source_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating source: {str(e)}")


@router.post("/sources/{source_id}/retry", response_model=SourceResponse)
async def retry_source_processing(source_id: str):
    """Retry processing for a failed or stuck source."""
    try:
        # First, verify source exists
        source = await Source.get(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        # Check if source already has a running command
        if source.command:
            try:
                status = await source.get_status()
                if status in ["running", "queued"]:
                    raise HTTPException(
                        status_code=400,
                        detail="Source is already processing. Cannot retry while processing is active.",
                    )
            except Exception as e:
                logger.warning(
                    f"Failed to check current status for source {source_id}: {e}"
                )
                # Continue with retry if we can't check status

        # Get projects that this source belongs to. `reference` is a graph edge
        # (RELATE source->reference->Project), so it only has `in`/`out` columns —
        # there is no `source`/`Project` column. Mirror the working query at the
        # source-list path above. See issue #861.
        references = await repo_query(
            "SELECT VALUE out FROM reference WHERE in = $source_id",
            {"source_id": ensure_record_id(source.id or source_id)},
        )
        project_ids = [str(nb_id) for nb_id in references] if references else []

        if not project_ids:
            raise HTTPException(
                status_code=400, detail="Source is not associated with any projects"
            )

        # Prepare content_state based on source asset
        content_state = {}
        if source.asset:
            if source.asset.file_path:
                content_state = {
                    "file_path": source.asset.file_path,
                    "delete_source": False,  # Don't delete on retry
                }
            elif source.asset.url:
                content_state = {"url": source.asset.url}
            else:
                raise HTTPException(
                    status_code=400, detail="Source asset has no file_path or url"
                )
        else:
            # Check if it's a text source by trying to get full_text
            if source.full_text:
                content_state = {"content": source.full_text}
            else:
                raise HTTPException(
                    status_code=400, detail="Cannot determine source content for retry"
                )

        try:
            # Import command modules to ensure they're registered
            import commands.source_commands  # noqa: F401

            # Submit new command for background processing
            command_input = SourceProcessingInput(
                source_id=str(source.id),
                content_state=content_state,
                project_ids=project_ids,
                artifacts=[],  # No artifacts on retry unless user re-applies manually
                embed=True,  # Always embed on retry
            )

            command_id = await CommandService.submit_command_job(
                "construction_os",  # app name
                "process_source",  # command name
                command_input.model_dump(),
            )

            logger.info(
                f"Submitted retry processing command: {command_id} for source {source_id}"
            )

            # Update source with new command ID and reset pipeline child jobs
            # command_id already includes 'command:' prefix
            source.command = ensure_record_id(command_id)
            source.embed_command = None
            source.kg_command = None
            source.pipeline_stage = PIPELINE_EXTRACTING
            await source.save()

            # Get current embedded chunks count
            embedded_chunks = await source.get_embedded_chunks()

            # Return updated source response
            return SourceResponse(
                id=source.id or "",
                title=source.title,
                topics=source.topics or [],
                asset=AssetModel(
                    file_path=source.asset.file_path if source.asset else None,
                    url=source.asset.url if source.asset else None,
                )
                if source.asset
                else None,
                full_text=source.full_text,
                embedded=embedded_chunks > 0,
                embedded_chunks=embedded_chunks,
                created=str(source.created),
                updated=str(source.updated),
                command_id=command_id,
                status="queued",
                processing_info={
                    "retry": True,
                    "queued": True,
                    "stage": PIPELINE_EXTRACTING,
                },
                pipeline_stage=PIPELINE_EXTRACTING,
                stage=PIPELINE_EXTRACTING,
                processing_failures=resolve_processing_failures(
                    getattr(source, "processing_failures", None)
                ),
            )

        except Exception as e:
            logger.error(
                f"Failed to submit retry processing command for source {source_id}: {e}"
            )
            raise HTTPException(
                status_code=500, detail=f"Failed to queue retry processing: {str(e)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying source processing for {source_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error retrying source processing: {str(e)}"
        )


@router.delete("/sources/{source_id}")
async def delete_source(source_id: str):
    """Delete a source."""
    try:
        source = await Source.get(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")

        await source.delete()

        return {"message": "Source deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting source {source_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting source: {str(e)}")


