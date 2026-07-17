"""Shared types and coordinate helpers for architectural drawing extraction."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field


class BBox(BaseModel):
    """Axis-aligned bounding box."""

    x0: float
    y0: float
    x1: float
    y1: float

    def as_tuple(self) -> Tuple[float, float, float, float]:
        return (self.x0, self.y0, self.x1, self.y1)

    def width(self) -> float:
        return max(0.0, self.x1 - self.x0)

    def height(self) -> float:
        return max(0.0, self.y1 - self.y0)

    def area(self) -> float:
        return self.width() * self.height()

    def intersects(self, other: "BBox") -> bool:
        return not (
            self.x1 < other.x0
            or other.x1 < self.x0
            or self.y1 < other.y0
            or other.y1 < self.y0
        )

    def iou(self, other: "BBox") -> float:
        ix0 = max(self.x0, other.x0)
        iy0 = max(self.y0, other.y0)
        ix1 = min(self.x1, other.x1)
        iy1 = min(self.y1, other.y1)
        if ix1 <= ix0 or iy1 <= iy0:
            return 0.0
        inter = (ix1 - ix0) * (iy1 - iy0)
        union = self.area() + other.area() - inter
        return inter / union if union > 0 else 0.0

    def expand(self, pad: float) -> "BBox":
        return BBox(
            x0=self.x0 - pad,
            y0=self.y0 - pad,
            x1=self.x1 + pad,
            y1=self.y1 + pad,
        )


def pdf_to_norm(bbox: BBox, page_width: float, page_height: float) -> BBox:
    """Normalize PDF coordinates to [0, 1] page space."""
    w = page_width if page_width else 1.0
    h = page_height if page_height else 1.0
    return BBox(
        x0=max(0.0, min(1.0, bbox.x0 / w)),
        y0=max(0.0, min(1.0, bbox.y0 / h)),
        x1=max(0.0, min(1.0, bbox.x1 / w)),
        y1=max(0.0, min(1.0, bbox.y1 / h)),
    )


def norm_to_pdf(bbox: BBox, page_width: float, page_height: float) -> BBox:
    """Convert normalized [0, 1] coordinates back to PDF space."""
    return BBox(
        x0=bbox.x0 * page_width,
        y0=bbox.y0 * page_height,
        x1=bbox.x1 * page_width,
        y1=bbox.y1 * page_height,
    )


ConfidenceBand = Literal[
    "verified",
    "high_confidence",
    "medium_confidence",
    "needs_review",
    "conflicting",
    "unsupported",
]


class EvidenceField(BaseModel):
    """A single extracted field with provenance."""

    value: Optional[Any] = None
    raw_text: Optional[str] = None
    page_index: Optional[int] = None
    region_id: Optional[str] = None
    bbox_norm: Optional[BBox] = None
    bbox_pdf: Optional[BBox] = None
    confidence: float = 0.0
    extraction_method: str = "unknown"


class DrawingItemDraft(BaseModel):
    """In-memory drawing item before persistence."""

    stable_id: str
    item_type: str
    subtype: Optional[str] = None
    label: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)
    raw_text: Optional[str] = None
    page_index: int = 0
    region_key: Optional[str] = None
    bbox_pdf: Optional[BBox] = None
    bbox_norm: Optional[BBox] = None
    evidence_crop: Optional[str] = None
    confidence: float = 0.0
    confidence_band: ConfidenceBand = "medium_confidence"
    extraction_method: str = "deterministic"
    verification_status: str = "unverified"
    model_version: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class DrawingRelationshipDraft(BaseModel):
    """In-memory relationship before persistence."""

    relationship_type: str
    from_item_id: Optional[str] = None
    to_item_id: Optional[str] = None
    from_label: Optional[str] = None
    to_label: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0
    evidence: Dict[str, Any] = Field(default_factory=dict)


class PageClassification(BaseModel):
    is_drawing: bool = False
    discipline: str = "unknown"
    sheet_number: Optional[str] = None
    sheet_title: Optional[str] = None
    drawing_types: List[str] = Field(default_factory=list)
    confidence: float = 0.0
    reasons: List[str] = Field(default_factory=list)
    major_regions: List[Dict[str, Any]] = Field(default_factory=list)


class RegionDraft(BaseModel):
    region_type: str
    bbox_pdf: BBox
    bbox_norm: BBox
    crop_path: Optional[str] = None
    confidence: float = 0.0
    detection_method: str = "heuristic"
