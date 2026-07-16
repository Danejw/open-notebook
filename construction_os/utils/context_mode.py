"""Shared context inclusion mode normalization (legacy insights → full)."""


def normalize_inclusion_status(status: str) -> str:
    """Map legacy 'insights' inclusion labels to 'full content'."""
    if "insights" in status and "full content" not in status:
        return "full content"
    return status


def is_excluded(status: str) -> bool:
    """Return True when a source/note is explicitly excluded from context."""
    return "not in" in str(status).lower()


def is_source_included(status: str) -> bool:
    """Return True when a source should be included in chat context."""
    status_l = str(status).lower()
    if "not in" in status_l:
        return False
    return "insights" in status_l or "full content" in status_l


def is_note_included(status: str) -> bool:
    """Return True when a note should be included in chat context."""
    status_l = str(status).lower()
    if "not in" in status_l:
        return False
    return "full content" in status_l
