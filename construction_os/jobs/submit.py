"""Submit surreal-commands jobs from construction_os without depending on api/."""

from __future__ import annotations

from typing import Any, Optional

from loguru import logger
from surreal_commands import submit_command


def submit_command_job(
    module_name: str,
    command_name: str,
    command_args: dict[str, Any],
    context: Optional[dict[str, Any]] = None,
) -> str:
    """Submit a command job and return its id as a string.

    ``module_name`` is the surreal-commands app name (e.g. ``construction_os``).
    ``context`` is accepted for API compatibility and currently unused.
    """
    _ = context
    try:
        import commands  # noqa: F401
    except ImportError as import_err:
        logger.error(f"Failed to import command modules: {import_err}")
        raise ValueError("Command modules not available") from import_err

    try:
        cmd_id = submit_command(module_name, command_name, command_args)
        if not cmd_id:
            raise ValueError("Failed to get cmd_id from submit_command")
        cmd_id_str = str(cmd_id)
        logger.info(
            f"Submitted command job: {cmd_id_str} for {module_name}.{command_name}"
        )
        return cmd_id_str
    except Exception as e:
        logger.error(f"Failed to submit command job: {e}")
        raise
