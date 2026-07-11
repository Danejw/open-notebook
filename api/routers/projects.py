from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from api.models import (
    ProjectCreate,
    ProjectDeletePreview,
    ProjectDeleteResponse,
    ProjectResponse,
    ProjectUpdate,
)
from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.project import Project, Source
from construction_os.exceptions import InvalidInputError, NotFoundError

router = APIRouter()


@router.get("/projects", response_model=List[ProjectResponse])
async def get_projects(
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    order_by: str = Query("updated desc", description="Order by field and direction"),
):
    """Get all projects with optional filtering and ordering."""
    try:
        # Validate order_by against allowlist to prevent SurrealQL injection
        allowed_fields = {"name", "created", "updated"}
        allowed_directions = {"asc", "desc"}

        parts = order_by.strip().lower().split()
        if len(parts) == 1:
            if parts[0] not in allowed_fields:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid order_by field: '{order_by}'. Allowed fields: {', '.join(sorted(allowed_fields))}",
                )
            validated_order_by = parts[0]
        elif len(parts) == 2:
            if parts[0] not in allowed_fields or parts[1] not in allowed_directions:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid order_by: '{order_by}'. Allowed fields: {', '.join(sorted(allowed_fields))}. Allowed directions: asc, desc",
                )
            validated_order_by = f"{parts[0]} {parts[1]}"
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid order_by format: '{order_by}'. Expected 'field' or 'field direction'",
            )

        # Build the query with counts
        query = f"""
            SELECT *,
            count(<-reference.in) as source_count,
            count(<-project_note.in) as note_count
            FROM project
            ORDER BY {validated_order_by}
        """

        result = await repo_query(query)

        # Filter by archived status if specified
        if archived is not None:
            result = [row for row in result if row.get("archived") == archived]

        return [
            ProjectResponse(
                id=str(row.get("id", "")),
                name=row.get("name", ""),
                description=row.get("description", ""),
                archived=row.get("archived", False),
                created=str(row.get("created", "")),
                updated=str(row.get("updated", "")),
                source_count=row.get("source_count", 0),
                note_count=row.get("note_count", 0),
            )
            for row in result
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching projects: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching projects: {str(e)}"
        )


@router.post("/projects", response_model=ProjectResponse)
async def create_project(project_data: ProjectCreate):
    """Create a new Project."""
    try:
        new_project = Project(
            name=project_data.name,
            description=project_data.description,
        )
        await new_project.save()

        return ProjectResponse(
            id=new_project.id or "",
            name=new_project.name,
            description=new_project.description,
            archived=new_project.archived or False,
            created=str(new_project.created),
            updated=str(new_project.updated),
            source_count=0,  # New Project has no sources
            note_count=0,  # New Project has no notes
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating Project: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating Project: {str(e)}"
        )


@router.get(
    "/projects/{project_id}/delete-preview", response_model=ProjectDeletePreview
)
async def get_project_delete_preview(project_id: str):
    """Get a preview of what will be deleted when this Project is deleted."""
    try:
        project = await Project.get(project_id)

        preview = await project.get_delete_preview()

        return ProjectDeletePreview(
            project_id=str(project.id),
            project_name=project.name,
            note_count=preview["note_count"],
            exclusive_source_count=preview["exclusive_source_count"],
            shared_source_count=preview["shared_source_count"],
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as e:
        logger.error(f"Error getting delete preview for Project {project_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching Project deletion preview: {str(e)}",
        )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """Get a specific Project by ID."""
    try:
        # Query with counts for single Project
        query = """
            SELECT *,
            count(<-reference.in) as source_count,
            count(<-project_note.in) as note_count
            FROM $project_id
        """
        result = await repo_query(query, {"project_id": ensure_record_id(project_id)})

        if not result:
            raise HTTPException(status_code=404, detail="Project not found")

        row = result[0]
        return ProjectResponse(
            id=str(row.get("id", "")),
            name=row.get("name", ""),
            description=row.get("description", ""),
            archived=row.get("archived", False),
            created=str(row.get("created", "")),
            updated=str(row.get("updated", "")),
            source_count=row.get("source_count", 0),
            note_count=row.get("note_count", 0),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching Project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching Project: {str(e)}"
        )


@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project_update: ProjectUpdate):
    """Update a Project."""
    try:
        project = await Project.get(project_id)

        # Update only provided fields
        if project_update.name is not None:
            project.name = project_update.name
        if project_update.description is not None:
            project.description = project_update.description
        if project_update.archived is not None:
            project.archived = project_update.archived

        await project.save()

        # Query with counts after update
        query = """
            SELECT *,
            count(<-reference.in) as source_count,
            count(<-project_note.in) as note_count
            FROM $project_id
        """
        result = await repo_query(query, {"project_id": ensure_record_id(project_id)})

        if result:
            row = result[0]
            return ProjectResponse(
                id=str(row.get("id", "")),
                name=row.get("name", ""),
                description=row.get("description", ""),
                archived=row.get("archived", False),
                created=str(row.get("created", "")),
                updated=str(row.get("updated", "")),
                source_count=row.get("source_count", 0),
                note_count=row.get("note_count", 0),
            )

        # Fallback if query fails
        return ProjectResponse(
            id=project.id or "",
            name=project.name,
            description=project.description,
            archived=project.archived or False,
            created=str(project.created),
            updated=str(project.updated),
            source_count=0,
            note_count=0,
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating Project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating Project: {str(e)}"
        )


@router.post("/projects/{project_id}/sources/{source_id}")
async def add_source_to_project(project_id: str, source_id: str):
    """Add an existing source to a Project (create the reference)."""
    try:
        # Verify the Project and source exist (raises NotFoundError -> 404)
        await Project.get(project_id)
        await Source.get(source_id)

        # Check if reference already exists (idempotency)
        existing_ref = await repo_query(
            "SELECT * FROM reference WHERE out = $source_id AND in = $project_id",
            {
                "project_id": ensure_record_id(project_id),
                "source_id": ensure_record_id(source_id),
            },
        )

        # If reference doesn't exist, create it
        if not existing_ref:
            await repo_query(
                "RELATE $source_id->reference->$project_id",
                {
                    "project_id": ensure_record_id(project_id),
                    "source_id": ensure_record_id(source_id),
                },
            )

        return {"message": "Source linked to Project successfully"}
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project or source not found")
    except Exception as e:
        logger.error(
            f"Error linking source {source_id} to Project {project_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail=f"Error linking source to Project: {str(e)}"
        )


@router.delete("/projects/{project_id}/sources/{source_id}")
async def remove_source_from_project(project_id: str, source_id: str):
    """Remove a source from a Project (delete the reference)."""
    try:
        # Verify the Project exists (raises NotFoundError -> 404)
        await Project.get(project_id)

        # Delete the reference record linking source to Project
        await repo_query(
            "DELETE FROM reference WHERE out = $project_id AND in = $source_id",
            {
                "project_id": ensure_record_id(project_id),
                "source_id": ensure_record_id(source_id),
            },
        )

        return {"message": "Source removed from Project successfully"}
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as e:
        logger.error(
            f"Error removing source {source_id} from Project {project_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500, detail=f"Error removing source from Project: {str(e)}"
        )


@router.delete("/projects/{project_id}", response_model=ProjectDeleteResponse)
async def delete_project(
    project_id: str,
    delete_exclusive_sources: bool = Query(
        False,
        description="Whether to delete sources that belong only to this Project",
    ),
):
    """
    Delete a Project with cascade deletion.

    Always deletes all notes associated with the Project.
    If delete_exclusive_sources is True, also deletes sources that belong only
    to this Project (not linked to any other projects).
    """
    try:
        project = await Project.get(project_id)

        result = await project.delete(delete_exclusive_sources=delete_exclusive_sources)

        return ProjectDeleteResponse(
            message="Project deleted successfully",
            deleted_notes=result["deleted_notes"],
            deleted_sources=result["deleted_sources"],
            unlinked_sources=result["unlinked_sources"],
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as e:
        logger.error(f"Error deleting Project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting Project: {str(e)}"
        )
