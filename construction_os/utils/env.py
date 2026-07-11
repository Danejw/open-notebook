"""Environment variable helpers with legacy Open Notebook fallback."""

from __future__ import annotations

import os
from typing import Optional


def legacy_open_notebook_name(name: str) -> Optional[str]:
    """Map ``CONSTRUCTION_OS_FOO`` → ``OPEN_NOTEBOOK_FOO`` for legacy installs."""
    if name.startswith("CONSTRUCTION_OS_"):
        return "OPEN_NOTEBOOK_" + name.removeprefix("CONSTRUCTION_OS_")
    return None


def get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    """Read an env var, falling back to the legacy ``OPEN_NOTEBOOK_*`` name."""
    value = os.environ.get(name)
    if value not in (None, ""):
        return value

    legacy = legacy_open_notebook_name(name)
    if legacy:
        value = os.environ.get(legacy)
        if value not in (None, ""):
            return value

    return default
