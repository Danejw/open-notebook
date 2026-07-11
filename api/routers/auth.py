"""
Authentication router for Construction OS API.
Provides endpoints to check authentication status.
"""

from fastapi import APIRouter

from construction_os.utils.encryption import get_secret_from_env

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
async def get_auth_status():
    """
    Check if authentication is enabled.
    Returns whether a password is required to access the API.
    Supports Docker secrets via CONSTRUCTION_OS_PASSWORD_FILE.
    """
    auth_enabled = bool(get_secret_from_env("CONSTRUCTION_OS_PASSWORD"))

    return {
        "auth_enabled": auth_enabled,
        "message": "Authentication is required"
        if auth_enabled
        else "Authentication is disabled",
    }