"""Opportunity watch, refresh, change-history, and health API routes."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from loguru import logger
from pydantic import BaseModel

from api.opportunity_models import OpportunityResponse
from construction_os.domain.opportunity import Opportunity, OpportunityChange
from construction_os.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
)
from construction_os.services.opportunities import get_opportunity
from construction_os.services.opportunity_monitoring import (
    acknowledge_opportunity_changes,
    activate_opportunity_monitoring,
    deactivate_opportunity_monitoring,
    list_opportunity_changes,
    monitoring_health_summary,
    refresh_opportunity,
)

router = APIRouter()


class OpportunityChangeResponse(BaseModel):
    id: str
    opportunity_id: str
    detected_at: datetime
    trigger: Literal["initial", "scheduled", "manual"]
    severity: Literal["informational", "important", "critical"]
    summary: str
    source_updated_at: Optional[datetime]
    changed_fields: Dict[str, Dict[str, Any]]
    new_documents: List[Dict[str, Any]]
    removed_documents: List[Dict[str, Any]]
    snapshot_hash: str
    acknowledged: bool


class OpportunityRefreshResponse(BaseModel):
    opportunity: OpportunityResponse
    changed: bool
    change: Optional[OpportunityChangeResponse]


def _opportunity_response(item: Opportunity) -> OpportunityResponse:
    data = item.model_dump(exclude={"raw_payload"})
    data["id"] = item.id or ""
    return OpportunityResponse(**data)


def _change_response(item: Optional[OpportunityChange]) -> Optional[OpportunityChangeResponse]:
    if item is None:
        return None
    data = item.model_dump()
    data["id"] = item.id or ""
    return OpportunityChangeResponse(**data)


def _refresh_response(result: Dict[str, Any]) -> OpportunityRefreshResponse:
    return OpportunityRefreshResponse(
        opportunity=_opportunity_response(result["opportunity"]),
        changed=bool(result["changed"]),
        change=_change_response(result.get("change")),
    )


@router.post(
    "/opportunities/{opportunity_id}/watch",
    response_model=OpportunityRefreshResponse,
)
async def watch_opportunity(opportunity_id: str):
    """Activate monitoring and immediately establish or refresh the source baseline."""

    try:
        result = await activate_opportunity_monitoring(
            opportunity_id,
            trigger="initial",
            refresh_now=True,
        )
        return _refresh_response(result)
    except (NotFoundError, InvalidInputError, ConfigurationError, ExternalServiceError) as exc:
        # Activation remains durable when the first source check fails. Return the
        # stored monitor health so the UI can show the actual failure state.
        try:
            opportunity = await get_opportunity(opportunity_id)
        except NotFoundError:
            raise HTTPException(status_code=404, detail="Opportunity not found") from exc
        if opportunity.monitoring_enabled:
            return OpportunityRefreshResponse(
                opportunity=_opportunity_response(opportunity),
                changed=False,
                change=None,
            )
        status_code = 422 if isinstance(exc, (InvalidInputError, ConfigurationError)) else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Failed to activate opportunity monitoring: {}", exc)
        raise HTTPException(status_code=500, detail="Failed to watch opportunity") from exc


@router.post(
    "/opportunities/{opportunity_id}/unwatch",
    response_model=OpportunityResponse,
)
async def unwatch_opportunity(opportunity_id: str):
    try:
        return _opportunity_response(
            await deactivate_opportunity_monitoring(opportunity_id)
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Failed to disable opportunity monitoring: {}", exc)
        raise HTTPException(status_code=500, detail="Failed to stop monitoring") from exc


@router.post(
    "/opportunities/{opportunity_id}/check-now",
    response_model=OpportunityRefreshResponse,
)
async def check_opportunity_now(opportunity_id: str):
    try:
        return _refresh_response(
            await refresh_opportunity(opportunity_id, trigger="manual")
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidInputError, ConfigurationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ExternalServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Failed to refresh opportunity {}: {}", opportunity_id, exc)
        raise HTTPException(status_code=500, detail="Failed to refresh opportunity") from exc


@router.get(
    "/opportunities/{opportunity_id}/changes",
    response_model=List[OpportunityChangeResponse],
)
async def get_opportunity_changes(
    opportunity_id: str,
    limit: int = Query(50, ge=1, le=200),
):
    try:
        changes = await list_opportunity_changes(opportunity_id, limit=limit)
        return [_change_response(change) for change in changes]
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Failed to list changes for {}: {}", opportunity_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch change history") from exc


@router.post(
    "/opportunities/{opportunity_id}/changes/acknowledge",
    response_model=OpportunityResponse,
)
async def acknowledge_changes(opportunity_id: str):
    try:
        return _opportunity_response(
            await acknowledge_opportunity_changes(opportunity_id)
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Failed to acknowledge changes for {}: {}", opportunity_id, exc)
        raise HTTPException(status_code=500, detail="Failed to acknowledge changes") from exc


@router.get("/opportunities/monitoring/health", response_model=Dict[str, Any])
async def get_opportunity_monitoring_health():
    """Expose read-only scheduler health without a public run-all mutation."""

    try:
        return await monitoring_health_summary()
    except Exception as exc:
        logger.error("Failed to summarize opportunity monitor health: {}", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch monitor health") from exc
