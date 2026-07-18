"""Schema autofill API — fill arbitrary JSON Schema from uploaded files."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from loguru import logger
from pydantic import BaseModel, Field

from api.routers.sources import save_uploaded_file
from construction_os.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    RateLimitError,
)
from construction_os.services.schema_autofill import autofill_from_files

router = APIRouter()


class AutofillFileMeta(BaseModel):
    filename: str
    chars: int


class AutofillResponse(BaseModel):
    data: Dict[str, Any]
    extracted_chars: int
    files: List[AutofillFileMeta] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


@router.post("/tools/autofill", response_model=AutofillResponse)
async def autofill_from_upload(
    files: List[UploadFile] = File(..., description="One or more files to analyze"),
    output_schema: str = Form(
        ..., description="JSON Schema object as a JSON string"
    ),
    instructions: Optional[str] = Form(None),
    model_id: Optional[str] = Form(None),
):
    """Extract text from files and fill values matching the caller-supplied schema."""

    try:
        try:
            schema_obj = json.loads(output_schema)
        except json.JSONDecodeError as exc:
            raise InvalidInputError("output_schema must be valid JSON") from exc

        if not files:
            raise InvalidInputError("At least one file is required")

        saved: List[tuple[str, str]] = []
        for upload in files:
            path = await save_uploaded_file(upload)
            saved.append((upload.filename or "upload", path))

        result = await autofill_from_files(
            file_paths=saved,
            schema=schema_obj,
            instructions=instructions,
            model_id=model_id or None,
        )
        return AutofillResponse(**result)
    except InvalidInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ExternalServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Autofill failed: {exc}")
        raise HTTPException(status_code=500, detail="Autofill failed") from exc
