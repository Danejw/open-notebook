"""Configuration for architectural drawing extraction.

All provider/model IDs are env-configurable. Do not hardcode model names in
business logic — read them through these helpers.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

EXTRACTOR_ID = "architectural_drawing_v1"
EXTRACTOR_VERSION = "1.0.0"

# Status values for drawing_extraction_run (independent of source pipeline_stage)
STATUS_QUEUED = "queued"
STATUS_INSPECTING = "inspecting"
STATUS_EXTRACTING = "extracting"
STATUS_VALIDATING = "validating"
STATUS_PUBLISHING = "publishing"
STATUS_COMPLETED = "completed"
STATUS_PARTIAL = "partial"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"

ACTIVE_RUN_STATUSES = frozenset({STATUS_COMPLETED, STATUS_PARTIAL})

DISCIPLINES = (
    "architectural",
    "structural",
    "mechanical",
    "electrical",
    "plumbing",
    "fire_protection",
    "civil",
    "landscape",
    "food_service",
    "general",
    "unknown",
)

DRAWING_TYPES = (
    "cover",
    "index",
    "code_plan",
    "site_plan",
    "demolition_plan",
    "floor_plan",
    "finish_plan",
    "reflected_ceiling_plan",
    "furniture_plan",
    "equipment_plan",
    "enlarged_plan",
    "elevation",
    "section",
    "detail",
    "schedule",
    "diagram",
    "notes",
    "specifications",
    "unknown",
)

CONFIDENCE_BANDS = (
    "verified",
    "high_confidence",
    "medium_confidence",
    "needs_review",
    "conflicting",
    "unsupported",
)


@dataclass(frozen=True)
class DrawingExtractionConfig:
    """Resolved runtime configuration for a drawing extraction run."""

    extraction_provider: str
    extraction_model: str
    verification_provider: str
    verification_model: str
    embedding_model_hint: str
    media_resolution: str
    page_render_dpi: int
    thumbnail_dpi: int
    crop_overlap: float
    dense_crop_dpi: int
    publish_embeddings: bool
    publish_knowledge_graph: bool
    use_vision: bool


def _env(name: str, default: str) -> str:
    return (os.getenv(name) or default).strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(str(raw).strip())
    except ValueError:
        return default


def get_drawing_retrieval_mode() -> str:
    """Return CONSTRUCTION_OS_DRAWING_RAG_MODE: off | shadow | on."""
    mode = _env("CONSTRUCTION_OS_DRAWING_RAG_MODE", "off").lower()
    if mode not in {"off", "shadow", "on"}:
        return "off"
    return mode


def load_drawing_extraction_config() -> DrawingExtractionConfig:
    """Load configurable models/providers for drawing extraction."""
    return DrawingExtractionConfig(
        extraction_provider=_env(
            "CONSTRUCTION_OS_DRAWING_EXTRACTION_PROVIDER", "google"
        ),
        extraction_model=_env(
            "CONSTRUCTION_OS_DRAWING_EXTRACTION_MODEL",
            "gemini-3.5-flash",
        ),
        verification_provider=_env(
            "CONSTRUCTION_OS_DRAWING_VERIFICATION_PROVIDER", "google"
        ),
        verification_model=_env(
            "CONSTRUCTION_OS_DRAWING_VERIFICATION_MODEL",
            "gemini-3.1-pro",
        ),
        embedding_model_hint=_env(
            "CONSTRUCTION_OS_DRAWING_EMBEDDING_MODEL",
            "gemini-embedding-2",
        ),
        media_resolution=_env(
            "CONSTRUCTION_OS_DRAWING_MEDIA_RESOLUTION", "high"
        ),
        page_render_dpi=_env_int("CONSTRUCTION_OS_DRAWING_PAGE_DPI", 200),
        thumbnail_dpi=_env_int("CONSTRUCTION_OS_DRAWING_THUMBNAIL_DPI", 72),
        crop_overlap=_env_float("CONSTRUCTION_OS_DRAWING_CROP_OVERLAP", 0.15),
        dense_crop_dpi=_env_int("CONSTRUCTION_OS_DRAWING_DENSE_CROP_DPI", 300),
        publish_embeddings=_env_bool(
            "CONSTRUCTION_OS_DRAWING_PUBLISH_EMBEDDINGS", True
        ),
        publish_knowledge_graph=_env_bool(
            "CONSTRUCTION_OS_DRAWING_PUBLISH_KG", True
        ),
        use_vision=_env_bool("CONSTRUCTION_OS_DRAWING_USE_VISION", True),
    )
