"""Shared helpers for surreal-commands workers."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


def full_model_dump(model: Any) -> Any:
    """Recursively convert Pydantic models (and nested containers) to plain dicts."""
    if isinstance(model, BaseModel):
        return model.model_dump()
    if isinstance(model, dict):
        return {k: full_model_dump(v) for k, v in model.items()}
    if isinstance(model, list):
        return [full_model_dump(item) for item in model]
    return model
