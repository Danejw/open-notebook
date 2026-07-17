"""Opportunity Hub API routes."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from api.opportunity_models import (
    OpportunityCreate,
    OpportunityDashboardResponse,
    OpportunityImportRequest,
    OpportunityImportResponse,
    OpportunityListResponse,
    OpportunityResponse,
    OpportunitySourceResponse,
    OpportunityStatusRequest,
    OpportunityUpdate,
    PursueOpportunityResponse,
)
from construction_os.domain.opportunity import Opportunity, OpportunitySource
from construction_os.exceptions import InvalidInputError, NotFoundError
from construction_os.services.opportunities import (
    get_opportunity,
    import_opportunities,
    list_opportunities,
    list_opportunity_sources,
    opportunity_dashboard,
    pursue_opportunity,
    seed_opportunity_sources,
    set_opportunity_status,
    upsert_opportunity,
)

router = APIRouter()


def _opportunity_response(item: Opportunity) -> OpportunityResponse:
    data = item.model_dump(exclude={"raw_payload"})
    data["id"] = item.id or ""
    return OpportunityResponse(**data)


def _source_response(item: OpportunitySource) -> OpportunitySourceResponse:
    data = item.model_dump(exclude={"settings"})
    data["id"] = item.id or ""
    return OpportunitySourceResponse(**data)


@router.get("/opportunity-sources", response_model=List[OpportunitySourceResponse])
async def get_opportunity_sources(
    enabled: Optional[bool] = Query(None, description="Filter by enabled state"),
):
    try:
        sources = await list_opportunity_sources(enabled=enabled)
        return [_source_response(source) for source in sources]
    except Exception as exc:
        logger.error(f"Error fetching opportunity sources: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch opportunity sources")


@router.post("/opportunity-sources/seed", response_model=List[OpportunitySourceResponse])
async def seed_hawaii_opportunity_sources():
    """Idempotently install the official Hawaii procurement source registry."""

    try:
        sources = await seed_opportunity_sources()
        return [_source_response(source) for source in sources]
    except Exception as exc:
        logger.error(f"Error seeding opportunity sources: {exc}")
        raise HTTPException(status_code=500, detail="Failed to seed opportunity sources")


@router.get("/opportunities/dashboard", response_model=OpportunityDashboardResponse)
async def get_opportunity_dashboard():
    try:
        return OpportunityDashboardResponse(**await opportunity_dashboard())
    except Exception as exc:
        logger.error(f"Error building opportunity dashboard: {exc}")
        raise HTTPException(status_code=500, detail="Failed to build opportunity dashboard")


@router.get("/opportunities", response_model=OpportunityListResponse)
async def get_opportunities(
    q: Optional[str] = Query(None, description="Search title, agency, scope, trade, or license"),
    status: Optional[str] = Query(None),
    island: Optional[str] = Query(None),
    trade: Optional[str] = Query(None),
    agency: Optional[str] = Query(None),
    source_key: Optional[str] = Query(None),
    due_before: Optional[datetime] = Query(None),
    due_after: Optional[datetime] = Query(None),
    min_fit_score: Optional[int] = Query(None, ge=0, le=100),
    include_archived: bool = Query(False),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    try:
        items, total = await list_opportunities(
            query=q,
            status=status,
            island=island,
            trade=trade,
            agency=agency,
            source_key=source_key,
            due_before=due_before,
            due_after=due_after,
            min_fit_score=min_fit_score,
            include_archived=include_archived,
            offset=offset,
            limit=limit,
        )
        return OpportunityListResponse(
            items=[_opportunity_response(item) for item in items],
            total=total,
            offset=offset,
            limit=limit,
        )
    except InvalidInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error fetching opportunities: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch opportunities")


@router.post("/opportunities", response_model=OpportunityResponse)
async def create_opportunity(payload: OpportunityCreate):
    """Create or refresh one normalized opportunity."""

    try:
        opportunity, _ = await upsert_opportunity(payload.model_dump())
        return _opportunity_response(opportunity)
    except InvalidInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error creating opportunity: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create opportunity")


@router.post("/opportunities/import", response_model=OpportunityImportResponse)
async def bulk_import_opportunities(payload: OpportunityImportRequest):
    """Bulk upsert normalized notices from a collector, email parser, or file import."""

    result = await import_opportunities(item.model_dump() for item in payload.items)
    return OpportunityImportResponse(**result)


@router.get("/opportunities/{opportunity_id}", response_model=OpportunityResponse)
async def get_opportunity_by_id(opportunity_id: str):
    try:
        return _opportunity_response(await get_opportunity(opportunity_id))
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    except Exception as exc:
        logger.error(f"Error fetching opportunity {opportunity_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch opportunity")


@router.put("/opportunities/{opportunity_id}", response_model=OpportunityResponse)
async def update_opportunity(opportunity_id: str, payload: OpportunityUpdate):
    try:
        opportunity = await get_opportunity(opportunity_id)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(opportunity, key, value)
        await opportunity.save()
        return _opportunity_response(opportunity)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    except (InvalidInputError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error updating opportunity {opportunity_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update opportunity")


@router.post(
    "/opportunities/{opportunity_id}/status", response_model=OpportunityResponse
)
async def update_opportunity_status(
    opportunity_id: str, payload: OpportunityStatusRequest
):
    try:
        return _opportunity_response(
            await set_opportunity_status(opportunity_id, payload.status)
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    except InvalidInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post(
    "/opportunities/{opportunity_id}/pursue",
    response_model=PursueOpportunityResponse,
)
async def pursue_opportunity_endpoint(opportunity_id: str):
    try:
        opportunity, project, project_created = await pursue_opportunity(opportunity_id)
        return PursueOpportunityResponse(
            opportunity=_opportunity_response(opportunity),
            project_id=project.id or "",
            project_name=project.name,
            project_created=project_created,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    except InvalidInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error pursuing opportunity {opportunity_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create bid workspace")


@router.delete("/opportunities/{opportunity_id}")
async def archive_opportunity(opportunity_id: str):
    """Archive instead of permanently deleting procurement history."""

    try:
        opportunity = await get_opportunity(opportunity_id)
        opportunity.archived = True
        await opportunity.save()
        return {"message": "Opportunity archived"}
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    except Exception as exc:
        logger.error(f"Error archiving opportunity {opportunity_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to archive opportunity")
