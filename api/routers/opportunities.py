"""Opportunity Hub API routes."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from api.opportunity_models import (
    OpportunityCreate,
    OpportunityDashboardResponse,
    OpportunityImportRequest,
    OpportunityImportResponse,
    OpportunityListResponse,
    OpportunityNaicsCollectionResponse,
    OpportunityResponse,
    OpportunityScoringProfileResponse,
    OpportunityScoringProfileUpdate,
    OpportunitySourceResponse,
    OpportunityStatusRequest,
    OpportunityUpdate,
    PursueOpportunityResponse,
    SamOpportunityUrlImportRequest,
    SamOpportunityUrlImportResponse,
    SamSyncCollectionUpdate,
)
from construction_os.domain.opportunity import Opportunity, OpportunitySource
from construction_os.domain.opportunity_scoring_profile import OpportunityScoringSettings
from construction_os.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
)
from construction_os.services.opportunities import (
    ensure_opportunity_description,
    ensure_opportunity_document_names,
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
from construction_os.services.opportunity_collectors import (
    import_sam_opportunity_from_url,
    resolve_collection_filter_strings,
    set_sam_sync_collection_id,
    sync_sam_gov_hawaii,
)
from construction_os.services.opportunity_naics_collections import (
    list_naics_collection_profiles,
)
from construction_os.services.opportunity_scoring import (
    SCORE_VERSION,
    OpportunityScoringProfile,
    aload_opportunity_scoring_profile,
)

router = APIRouter()

_SCORE_WEIGHTS: Dict[str, int] = {
    "trade_license": 25,
    "project_capacity": 20,
    "location": 15,
    "schedule": 15,
    "experience": 15,
    "risk_addenda": 10,
}


def _scoring_profile_response(
    profile: OpportunityScoringProfile,
    source: str,
    *,
    rescored: Optional[int] = None,
    failed: Optional[int] = None,
    errors: Optional[List[Dict[str, str]]] = None,
) -> OpportunityScoringProfileResponse:
    return OpportunityScoringProfileResponse(
        **profile.model_dump(),
        profile_ready=profile.is_ready,
        score_version=SCORE_VERSION,
        source=source,  # type: ignore[arg-type]
        weights=dict(_SCORE_WEIGHTS),
        rescored=rescored,
        failed=failed,
        errors=errors,
    )


async def _rescore_opportunities(*, include_archived: bool = False) -> Dict[str, Any]:
    items = await Opportunity.get_all(order_by="updated desc")
    rescored = 0
    errors: List[Dict[str, str]] = []
    for item in items:
        if item.archived and not include_archived:
            continue
        try:
            await item.save()
            rescored += 1
        except Exception as exc:
            errors.append({"id": item.id or "", "error": str(exc)})
    return {
        "rescored": rescored,
        "failed": len(errors),
        "errors": errors,
        "score_version": SCORE_VERSION,
    }


def _opportunity_response(item: Opportunity) -> OpportunityResponse:
    data = item.model_dump(exclude={"raw_payload"})
    data["id"] = item.id or ""
    return OpportunityResponse(**data)


def _source_response(item: OpportunitySource) -> OpportunitySourceResponse:
    data = item.model_dump(exclude={"settings"})
    data["id"] = item.id or ""
    raw = (item.settings or {}).get("sync_collection_id")
    data["sync_collection_id"] = (
        raw.strip() if isinstance(raw, str) and raw.strip() else None
    )
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


@router.get(
    "/opportunities/naics-collections",
    response_model=List[OpportunityNaicsCollectionResponse],
)
async def get_opportunity_naics_collections():
    """List active Collections that can control SAM.gov discovery."""

    try:
        return [
            OpportunityNaicsCollectionResponse(**profile)
            for profile in await list_naics_collection_profiles()
        ]
    except Exception as exc:
        logger.error(f"Error fetching NAICS collections: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch NAICS collections")


@router.post("/opportunity-sources/sam_gov_hawaii/sync", response_model=Dict[str, Any])
async def sync_sam_gov_hawaii_source(
    days_back: int = Query(14, ge=1, le=365),
    limit: int = Query(1000, ge=1, le=1000),
    collection_id: Optional[str] = Query(
        None,
        description=(
            "Collection to filter by. Omit to reuse the saved preference; "
            "pass empty string to clear the preference."
        ),
    ),
):
    """Pull recent federal opportunities whose place of performance is Hawaii."""

    try:
        return await sync_sam_gov_hawaii(
            days_back=days_back,
            limit=limit,
            collection_id=collection_id,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except InvalidInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ExternalServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected SAM.gov sync error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to sync SAM.gov opportunities")


@router.post(
    "/opportunity-sources/sam_gov_hawaii/import-url",
    response_model=SamOpportunityUrlImportResponse,
)
async def import_sam_gov_opportunity_url(body: SamOpportunityUrlImportRequest):
    """Import one SAM.gov notice by public opportunity URL into the Opportunity Hub."""

    try:
        result = await import_sam_opportunity_from_url(body.url)
        opportunity = result["opportunity"]
        return SamOpportunityUrlImportResponse(
            opportunity=_opportunity_response(opportunity),
            created=bool(result["created"]),
            updated=bool(result["updated"]),
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except InvalidInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ExternalServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected SAM.gov URL import error: {exc}")
        raise HTTPException(
            status_code=500, detail="Failed to import SAM.gov opportunity URL"
        )


@router.put(
    "/opportunity-sources/sam_gov_hawaii/sync-collection",
    response_model=OpportunitySourceResponse,
)
async def update_sam_sync_collection(body: SamSyncCollectionUpdate):
    """Save the Opportunity Hub collection preference used for SAM.gov sync."""

    try:
        if body.collection_id:
            await resolve_collection_filter_strings(body.collection_id)
        source = await set_sam_sync_collection_id(body.collection_id)
        return _source_response(source)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except InvalidInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error saving SAM sync collection preference: {exc}")
        raise HTTPException(
            status_code=500, detail="Failed to save sync collection preference"
        )


@router.get("/opportunities/dashboard", response_model=OpportunityDashboardResponse)
async def get_opportunity_dashboard():
    try:
        return OpportunityDashboardResponse(**await opportunity_dashboard())
    except Exception as exc:
        logger.error(f"Error building opportunity dashboard: {exc}")
        raise HTTPException(status_code=500, detail="Failed to build opportunity dashboard")


@router.get(
    "/opportunities/scoring-profile",
    response_model=OpportunityScoringProfileResponse,
)
async def get_opportunity_scoring_profile():
    """Return the active explainable scoring profile without exposing secrets."""

    profile, source = await aload_opportunity_scoring_profile()
    return _scoring_profile_response(profile, source)


@router.put(
    "/opportunities/scoring-profile",
    response_model=OpportunityScoringProfileResponse,
)
async def update_opportunity_scoring_profile(payload: OpportunityScoringProfileUpdate):
    """Persist the company fit profile and rescore non-archived opportunities."""

    try:
        profile = OpportunityScoringProfile.model_validate(payload.model_dump())
        settings = await OpportunityScoringSettings.get_instance()
        settings.apply_scoring_profile(profile)
        await settings.update()

        rescore_result = await _rescore_opportunities(include_archived=False)
        return _scoring_profile_response(
            profile,
            "database",
            rescored=rescore_result["rescored"],
            failed=rescore_result["failed"],
            errors=rescore_result["errors"],
        )
    except InvalidInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error updating opportunity scoring profile: {exc}")
        raise HTTPException(
            status_code=500, detail="Failed to update opportunity scoring profile"
        )


@router.post("/opportunities/rescore", response_model=Dict[str, Any])
async def rescore_all_opportunities(
    include_archived: bool = Query(False),
):
    """Recalculate all stored opportunities with the active company profile."""

    return await _rescore_opportunities(include_archived=include_archived)


@router.get("/opportunities", response_model=OpportunityListResponse)
async def get_opportunities(
    q: Optional[str] = Query(None, description="Search title, agency, scope, trade, or license"),
    status: Optional[str] = Query(None),
    source_stage: Optional[str] = Query(None),
    island: Optional[str] = Query(None),
    trade: Optional[str] = Query(None),
    agency: Optional[str] = Query(None),
    source_key: Optional[str] = Query(None),
    due_before: Optional[datetime] = Query(None),
    due_after: Optional[datetime] = Query(None),
    min_fit_score: Optional[int] = Query(None, ge=0, le=100),
    fit_score_band: Optional[str] = Query(
        None,
        description="Match band: high (>=75), medium (50-74), low (<50), unscored",
    ),
    sort: str = Query(
        "due",
        description="Sort order: due (default), fit_score_desc, fit_score_asc",
    ),
    include_archived: bool = Query(False),
    include_stale: bool = Query(
        False,
        description=(
            "Include overdue and deadline-missing opportunities. "
            "Default hides them unless status is watching, pursuing, or submitted."
        ),
    ),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    try:
        items, total = await list_opportunities(
            query=q,
            status=status,
            source_stage=source_stage,
            island=island,
            trade=trade,
            agency=agency,
            source_key=source_key,
            due_before=due_before,
            due_after=due_after,
            min_fit_score=min_fit_score,
            fit_score_band=fit_score_band,
            sort=sort,
            include_archived=include_archived,
            include_stale=include_stale,
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
        opportunity = await get_opportunity(opportunity_id)
        opportunity = await ensure_opportunity_description(opportunity)
        opportunity = await ensure_opportunity_document_names(opportunity)
        return _opportunity_response(opportunity)
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


@router.post("/opportunities/{opportunity_id}/rescore", response_model=OpportunityResponse)
async def rescore_opportunity(opportunity_id: str):
    """Recalculate one opportunity after company profile or addendum changes."""

    try:
        opportunity = await get_opportunity(opportunity_id)
        await opportunity.save()
        return _opportunity_response(opportunity)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    except Exception as exc:
        logger.error(f"Error rescoring opportunity {opportunity_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to rescore opportunity")


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
