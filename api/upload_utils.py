"""File upload helpers shared by sources, media, and autofill routers."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import UploadFile
from loguru import logger

from construction_os.config import UPLOADS_FOLDER


def generate_unique_filename(original_filename: str, upload_folder: str) -> str:
    """Generate unique filename (append counter if file exists)."""
    file_path = Path(upload_folder)
    file_path.mkdir(parents=True, exist_ok=True)

    # Strip directory components to prevent path traversal
    safe_filename = os.path.basename(original_filename)
    if not safe_filename:
        raise ValueError("Invalid filename")

    stem = Path(safe_filename).stem
    suffix = Path(safe_filename).suffix

    counter = 0
    while True:
        if counter == 0:
            new_filename = safe_filename
        else:
            new_filename = f"{stem} ({counter}){suffix}"

        full_path = file_path / new_filename
        resolved = full_path.resolve()
        if not str(resolved).startswith(str(file_path.resolve()) + os.sep):
            raise ValueError("Invalid filename: path traversal detected")
        if not resolved.exists():
            return str(resolved)
        counter += 1


async def save_uploaded_file(upload_file: UploadFile) -> str:
    """Save uploaded file to uploads folder and return file path."""
    if not upload_file.filename:
        raise ValueError("No filename provided")

    file_path = generate_unique_filename(upload_file.filename, UPLOADS_FOLDER)

    try:
        with open(file_path, "wb") as f:
            content = await upload_file.read()
            f.write(content)

        logger.info(f"Saved uploaded file to: {file_path}")
        return file_path
    except Exception as e:
        logger.error(f"Failed to save uploaded file: {e}")
        if os.path.exists(file_path):
            os.unlink(file_path)
        raise
