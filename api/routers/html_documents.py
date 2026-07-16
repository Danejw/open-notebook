"""API routes for HTML-native bid templates and documents."""

import asyncio
from typing import List

from fastapi import APIRouter, HTTPException, Response
from loguru import logger

from api.models import (
    DocumentCreate,
    DocumentDuplicateRequest,
    DocumentPdfRenderRequest,
    DocumentResponse,
    DocumentUpdate,
    HtmlTemplateCreate,
    HtmlTemplateResponse,
    HtmlTemplateUpdate,
)
from construction_os.database.repository import repo_query
from construction_os.domain.html_document import Document, HtmlTemplate
from construction_os.services.html_templates import html_template_to_dict
from construction_os.domain.project import Project
from construction_os.exceptions import InvalidInputError, NotFoundError
from construction_os.utils.html_pdf_export import render_html_pdf
from construction_os.utils.html_media import resolve_media_for_pdf, resolve_media_for_preview
from construction_os.utils.html_spans import (
    StructureChangedError,
    apply_span_updates,
    assert_same_span_structure,
)
from construction_os.utils.note_pdf_export import export_pdf_filename

router = APIRouter()

_VALID_CATEGORIES = {"estimate", "sow", "rfi", "other"}


def _looks_like_html(html_body: str) -> bool:
    stripped = (html_body or "").strip()
    return bool(stripped) and "<" in stripped and ">" in stripped


def _template_response(template: HtmlTemplate) -> HtmlTemplateResponse:
    data = html_template_to_dict(template, include_body=True)
    return HtmlTemplateResponse(
        id=data["id"],
        name=data["name"],
        category=data["category"],
        html_body=data["html_body"],
        created=data["created"] or "",
        updated=data["updated"] or "",
    )


def _document_response(document: Document) -> DocumentResponse:
    return DocumentResponse(
        id=document.id or "",
        project_id=document.project_id,
        template_id=document.template_id,
        title=document.title,
        scenario_label=document.scenario_label,
        html_body=document.html_body,
        parent_document_id=document.parent_document_id,
        created=str(document.created),
        updated=str(document.updated),
    )


@router.get("/templates/html", response_model=List[HtmlTemplateResponse])
async def list_html_templates():
    """List uploaded HTML bid templates."""
    try:
        templates = await HtmlTemplate.get_all(order_by="name asc")
        return [_template_response(t) for t in templates]
    except Exception as e:
        logger.error(f"Error listing HTML templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/templates/html", response_model=HtmlTemplateResponse)
async def create_html_template(data: HtmlTemplateCreate):
    """Upload a new HTML bid template."""
    try:
        if not _looks_like_html(data.html_body):
            raise InvalidInputError("Upload must be valid HTML content")
        category = data.category if data.category in _VALID_CATEGORIES else "other"
        template = HtmlTemplate(
            name=data.name.strip() or "Untitled template",
            category=category,  # type: ignore[arg-type]
            html_body=data.html_body,
        )
        await template.save()
        return _template_response(template)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating HTML template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates/html/{template_id}", response_model=HtmlTemplateResponse)
async def get_html_template(template_id: str):
    """Get a single HTML template."""
    try:
        template = await HtmlTemplate.get(template_id)
        return _template_response(template)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching HTML template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/templates/html/{template_id}", response_model=HtmlTemplateResponse)
async def update_html_template(template_id: str, data: HtmlTemplateUpdate):
    """Rename or update template HTML (Code → Update template)."""
    try:
        template = await HtmlTemplate.get(template_id)
        if data.name is not None:
            template.name = data.name.strip() or template.name
        if data.category is not None:
            if data.category not in _VALID_CATEGORIES:
                raise InvalidInputError("Invalid category")
            template.category = data.category  # type: ignore[assignment]
        if data.html_body is not None:
            if not _looks_like_html(data.html_body):
                raise InvalidInputError("html_body must be valid HTML content")
            template.html_body = data.html_body
        await template.save()
        return _template_response(template)
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating HTML template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/templates/html/{template_id}")
async def delete_html_template(template_id: str):
    """Delete an HTML template. Existing documents are left unchanged."""
    try:
        template = await HtmlTemplate.get(template_id)
        await template.delete()
        return {"message": "Template deleted"}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting HTML template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/projects/{project_id}/documents", response_model=List[DocumentResponse]
)
async def list_project_documents(project_id: str):
    """List bid documents for a project."""
    try:
        await Project.get(project_id)
        rows = await repo_query(
            "SELECT * FROM document WHERE project_id = $project_id ORDER BY updated DESC",
            {"project_id": project_id},
        )
        documents = [Document(**row) for row in rows]
        return [_document_response(d) for d in documents]
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/projects/{project_id}/documents", response_model=DocumentResponse
)
async def create_project_document(project_id: str, data: DocumentCreate):
    """Create a document by copying HTML from a template."""
    try:
        await Project.get(project_id)
        template = await HtmlTemplate.get(data.template_id)
        document = Document(
            project_id=project_id,
            template_id=template.id,
            title=(data.title or template.name).strip() or template.name,
            scenario_label=data.scenario_label.strip() or "Base",
            html_body=(data.html_body if data.html_body is not None else template.html_body),
        )
        await document.save()
        return _document_response(document)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: str):
    """Load a bid document."""
    try:
        document = await Document.get(document_id)
        return _document_response(document)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/documents/{document_id}", response_model=DocumentResponse)
async def update_document(document_id: str, data: DocumentUpdate):
    """Save Page/Amounts span updates or Code HTML to this document."""
    try:
        document = await Document.get(document_id)
        if data.title is not None:
            document.title = data.title.strip() or document.title
        if data.scenario_label is not None:
            document.scenario_label = data.scenario_label.strip() or document.scenario_label

        if data.span_updates is not None:
            document.html_body = apply_span_updates(
                document.html_body, data.span_updates
            )
        elif data.html_body is not None:
            if not _looks_like_html(data.html_body):
                raise InvalidInputError("html_body must be valid HTML content")
            if not data.allow_structure_change:
                assert_same_span_structure(document.html_body, data.html_body)
            document.html_body = data.html_body

        await document.save()
        return _document_response(document)
    except StructureChangedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/{document_id}/duplicate", response_model=DocumentResponse)
async def duplicate_document(document_id: str, data: DocumentDuplicateRequest):
    """Duplicate a document as a new named scenario."""
    try:
        source = await Document.get(document_id)
        duplicate = Document(
            project_id=source.project_id,
            template_id=source.template_id,
            title=(data.title or source.title).strip() or source.title,
            scenario_label=data.scenario_label.strip() or "Alt",
            html_body=source.html_body,
            parent_document_id=source.id,
        )
        await duplicate.save()
        return _document_response(duplicate)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error duplicating document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}/preview")
async def preview_document(document_id: str):
    """Return document HTML for preview (image tokens expanded)."""
    try:
        document = await Document.get(document_id)
        html = await resolve_media_for_preview(document.html_body)
        return Response(content=html, media_type="text/html")
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error previewing document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/render.pdf")
async def render_html_as_pdf(data: DocumentPdfRenderRequest):
    """Render arbitrary HTML (e.g. chat template output) as a PDF download."""
    try:
        if not _looks_like_html(data.html_body):
            raise InvalidInputError("html_body must be valid HTML content")
        prepared = await resolve_media_for_pdf(data.html_body)
        pdf_bytes = await asyncio.to_thread(render_html_pdf, prepared)
        filename = export_pdf_filename(data.title or "document")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error rendering HTML PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}/export.pdf")
async def export_document_pdf(document_id: str):
    """Export the current document HTML as PDF."""
    try:
        document = await Document.get(document_id)
        prepared = await resolve_media_for_pdf(document.html_body)
        pdf_bytes = await asyncio.to_thread(render_html_pdf, prepared)
        filename = export_pdf_filename(document.title)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error exporting document PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete a bid document."""
    try:
        document = await Document.get(document_id)
        await document.delete()
        return {"message": "Document deleted"}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))
