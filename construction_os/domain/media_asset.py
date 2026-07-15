"""Global media asset library for template images and logos."""

from typing import ClassVar, Optional

from construction_os.database.repository import repo_query
from construction_os.domain.base import ObjectModel
from construction_os.exceptions import NotFoundError


class MediaAsset(ObjectModel):
    """Uploaded image available to all HTML templates and documents."""

    table_name: ClassVar[str] = "media_asset"
    name: str
    slug: str
    file_path: str
    mime_type: str
    byte_size: int = 0

    @classmethod
    async def get_by_slug(cls, slug: str) -> "MediaAsset":
        """Fetch a media asset by its unique slug."""
        rows = await repo_query(
            "SELECT * FROM media_asset WHERE slug = $slug LIMIT 1",
            {"slug": slug},
        )
        if not rows:
            raise NotFoundError(f"Media asset with slug '{slug}' not found")
        return cls(**rows[0])

    @classmethod
    async def slug_exists(cls, slug: str, exclude_id: Optional[str] = None) -> bool:
        """Return True if another asset already uses this slug."""
        if exclude_id:
            rows = await repo_query(
                "SELECT id FROM media_asset WHERE slug = $slug AND id != $exclude_id LIMIT 1",
                {"slug": slug, "exclude_id": exclude_id},
            )
        else:
            rows = await repo_query(
                "SELECT id FROM media_asset WHERE slug = $slug LIMIT 1",
                {"slug": slug},
            )
        return bool(rows)
