"""
Generic ContextBuilder for the Construction OS project.

This module provides a flexible ContextBuilder class that can handle any parameters
and build context from sources, projects, and notes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

from loguru import logger

from construction_os.domain.project import Note, Project, Source
from construction_os.exceptions import DatabaseOperationError, NotFoundError
from construction_os.utils.context_mode import (
    is_excluded,
    is_note_included,
    normalize_inclusion_status,
)

from .token_utils import token_count


@dataclass
class ContextItem:
    """Represents a single item in the context."""

    id: str
    type: Literal["source", "note"]
    content: Dict[str, Any]
    priority: int = 0
    token_count: Optional[int] = None

    def __post_init__(self):
        """Calculate token count for the content if not provided."""
        if self.token_count is None:
            content_str = str(self.content)
            self.token_count = token_count(content_str)


@dataclass
class ContextConfig:
    """Configuration for context building."""

    sources: Optional[Dict[str, str]] = None  # {source_id: inclusion_level}
    notes: Optional[Dict[str, str]] = None  # legacy {note_id: inclusion_level}
    artifacts: Optional[Dict[str, str]] = None  # canonical {artifact_id: inclusion_level}
    include_notes: bool = True
    max_tokens: Optional[int] = None
    priority_weights: Optional[Dict[str, int]] = None  # {type: weight}

    def __post_init__(self):
        """Initialize default values."""
        if self.sources is None:
            self.sources = {}
        if self.notes is None:
            self.notes = {}
        if self.artifacts is None:
            self.artifacts = {}
        if self.priority_weights is None:
            self.priority_weights = {"source": 100, "note": 50, "artifact": 50}

    def resolved_artifacts(self) -> Dict[str, str]:
        """Merge legacy notes with canonical artifacts (artifacts win)."""
        return {**(self.notes or {}), **(self.artifacts or {})}


class ContextBuilder:
    """
    Generic ContextBuilder that can handle any parameters and build context
    from sources, projects, and notes.
    """

    def __init__(self, **kwargs):
        """
        Initialize ContextBuilder with flexible parameters.

        Supported parameters:
        - source_id: str - Include specific source
        - project_id: str - Include Project content
        - include_notes: bool - Include notes
        - context_config: ContextConfig - Custom context configuration
        - max_tokens: int - Maximum token limit
        - priority_order: List[str] - Custom priority order
        """
        # Store all parameters for flexibility
        self.params = kwargs

        # Extract commonly used parameters
        self.source_id: Optional[str] = kwargs.get("source_id")
        self.project_id: Optional[str] = kwargs.get("project_id")
        self.include_notes: bool = kwargs.get("include_notes", True)
        self.max_tokens: Optional[int] = kwargs.get("max_tokens")

        # Context configuration
        context_config_arg: Optional[ContextConfig] = kwargs.get("context_config")
        self.context_config: ContextConfig
        if context_config_arg is None:
            self.context_config = ContextConfig(
                include_notes=self.include_notes,
                max_tokens=self.max_tokens,
            )
        else:
            self.context_config = context_config_arg

        # Items storage
        self.items: List[ContextItem] = []

        logger.debug(f"ContextBuilder initialized with params: {list(kwargs.keys())}")

    async def build(self) -> Dict[str, Any]:
        """
        Build context based on provided parameters.

        Returns:
            Dict containing the built context with metadata
        """
        try:
            logger.info("Starting context building")

            # Clear existing items
            self.items = []

            # Build context based on parameters
            if self.source_id:
                await self._add_source_context(self.source_id)

            if self.project_id:
                await self._add_project_context(self.project_id)

            # Process any additional custom parameters
            await self._process_custom_params()

            # Apply post-processing
            self.remove_duplicates()
            self.prioritize()

            if self.max_tokens:
                self.truncate_to_fit(self.max_tokens)

            # Format and return response
            return self._format_response()

        except Exception as e:
            logger.error(f"Error building context: {str(e)}")
            raise DatabaseOperationError(f"Failed to build context: {str(e)}")

    async def _add_source_context(
        self, source_id: str, inclusion_level: str = "full content"
    ) -> None:
        """
        Add source to context.

        Args:
            source_id: ID of the source
            inclusion_level: "full content", "insights" (legacy→full), or "not in"
        """
        if is_excluded(inclusion_level):
            return
        inclusion_level = normalize_inclusion_status(inclusion_level)


        try:
            # Ensure source ID has table prefix
            full_source_id = (
                source_id if source_id.startswith("source:") else f"source:{source_id}"
            )

            source = await Source.get(full_source_id)
            if not source:
                logger.warning(f"Source {source_id} not found")
                return

            # Determine context size based on inclusion level
            context_size: Literal["short", "long"] = (
                "long" if "full content" in inclusion_level else "short"
            )
            source_context = await source.get_context(context_size=context_size)

            # Add source item
            priority = (self.context_config.priority_weights or {}).get("source", 100)
            item = ContextItem(
                id=source.id or "",
                type="source",
                content=source_context,
                priority=priority,
            )
            self.add_item(item)


            logger.debug(f"Added source context for {source_id}")

        except NotFoundError:
            logger.warning(f"Source {source_id} not found")
        except Exception as e:
            logger.error(f"Error adding source context for {source_id}: {str(e)}")
            raise

    async def _add_project_context(self, project_id: str) -> None:
        """
        Add Project content based on context configuration.

        Args:
            project_id: ID of the Project
        """
        try:
            project = await Project.get(project_id)
            if not project:
                raise NotFoundError(f"Project {project_id} not found")

            # Process sources from context config or get all
            config_sources = self.context_config.sources
            if config_sources:
                for source_id, status in config_sources.items():
                    await self._add_source_context(source_id, status)
            else:
                # Default: get all sources with full content
                sources = await project.get_sources()
                for source in sources:
                    if source.id:
                        await self._add_source_context(source.id, "full content")

            # Process notes from context config or get all
            if self.include_notes:
                config_notes = self.context_config.resolved_artifacts()
                if config_notes:
                    for note_id, status in config_notes.items():
                        if is_note_included(status):
                            await self._add_note_context(
                                note_id, normalize_inclusion_status(status)
                            )
                else:
                    # Default: get all notes with short content
                    notes = await project.get_notes()
                    for note in notes:
                        if note.id:
                            await self._add_note_context(note.id, "full content")

            logger.debug(f"Added Project context for {project_id}")

        except Exception as e:
            logger.error(f"Error adding Project context for {project_id}: {str(e)}")
            raise

    async def _add_note_context(
        self, note_id: str, inclusion_level: str = "full content"
    ) -> None:
        """
        Add note to context.

        Args:
            note_id: ID of the note
            inclusion_level: "full content" or "not in"
        """
        if inclusion_level == "not in":
            return

        try:
            # Ensure note ID has table prefix
            full_note_id = note_id if note_id.startswith("note:") else f"note:{note_id}"

            note = await Note.get(full_note_id)
            if not note:
                logger.warning(f"Note {note_id} not found")
                return

            # Get note context
            context_size: Literal["short", "long"] = (
                "long" if "full content" in inclusion_level else "short"
            )
            note_context = note.get_context(context_size=context_size)

            # Add note item
            priority = (self.context_config.priority_weights or {}).get("note", 50)
            item = ContextItem(
                id=note.id or "", type="note", content=note_context, priority=priority
            )
            self.add_item(item)

            logger.debug(f"Added note context for {note_id}")

        except NotFoundError:
            logger.warning(f"Note {note_id} not found")
        except Exception as e:
            logger.error(f"Error adding note context for {note_id}: {str(e)}")

    async def _process_custom_params(self) -> None:
        """Process any additional custom parameters."""
        # Hook for future extensions - can be overridden in subclasses
        # or used to process additional kwargs
        for key, value in self.params.items():
            if key.startswith("custom_"):
                logger.debug(f"Processing custom parameter: {key}={value}")
                # Custom processing logic can be added here

    def add_item(self, item: ContextItem) -> None:
        """
        Add a ContextItem to the builder.

        Args:
            item: ContextItem to add
        """
        self.items.append(item)
        logger.debug(f"Added item {item.id} with priority {item.priority}")

    def prioritize(self) -> None:
        """Sort items by priority (higher priority first)."""
        self.items.sort(key=lambda x: x.priority, reverse=True)
        logger.debug(f"Prioritized {len(self.items)} items")

    def truncate_to_fit(self, max_tokens: int) -> None:
        """
        Remove items if total token count exceeds limit.

        Args:
            max_tokens: Maximum allowed tokens
        """
        if not max_tokens:
            return

        total_tokens = sum(item.token_count or 0 for item in self.items)

        if total_tokens <= max_tokens:
            logger.debug(f"Token count {total_tokens} within limit {max_tokens}")
            return

        logger.info(f"Truncating from {total_tokens} to {max_tokens} tokens")

        # Remove items from the end (lowest priority) until under limit
        current_tokens = total_tokens
        removed_count = 0

        while current_tokens > max_tokens and self.items:
            removed_item = self.items.pop()
            current_tokens -= removed_item.token_count or 0
            removed_count += 1

        logger.info(
            f"Removed {removed_count} items, final token count: {current_tokens}"
        )

    def remove_duplicates(self) -> None:
        """Remove duplicate items based on ID."""
        seen_ids = set()
        deduplicated_items = []

        for item in self.items:
            if item.id not in seen_ids:
                deduplicated_items.append(item)
                seen_ids.add(item.id)

        removed_count = len(self.items) - len(deduplicated_items)
        self.items = deduplicated_items

        if removed_count > 0:
            logger.debug(f"Removed {removed_count} duplicate items")

    def _format_response(self) -> Dict[str, Any]:
        """
        Format the final response.

        Returns:
            Formatted context response
        """
        # Group items by type
        sources = []
        notes = []
        
        for item in self.items:
            if item.type == "source":
                sources.append(item.content)
            elif item.type == "note":
                notes.append(item.content)

        # Calculate total tokens
        total_tokens = sum(item.token_count or 0 for item in self.items)

        response = {
            "sources": sources,
            "notes": notes,
            "total_tokens": total_tokens,
            "total_items": len(self.items),
            "metadata": {
                "source_count": len(sources),
                "note_count": len(notes),
                "config": {
                    "include_notes": self.include_notes,
                    "max_tokens": self.max_tokens,
                },
            },
        }

        # Add project_id if provided
        if self.project_id:
            response["project_id"] = self.project_id

        logger.info(
            f"Built context with {len(self.items)} items, {total_tokens} tokens"
        )

        return response


# Convenience functions for common use cases


async def build_project_context(
    project_id: str,
    context_config: Optional[ContextConfig] = None,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Build context for a Project.

    Args:
        project_id: ID of the Project
        context_config: Optional context configuration
        max_tokens: Optional token limit

    Returns:
        Built context
    """
    builder = ContextBuilder(
        project_id=project_id, context_config=context_config, max_tokens=max_tokens
    )
    return await builder.build()


async def build_source_context(
    source_id: str, max_tokens: Optional[int] = None
) -> Dict[str, Any]:
    """
    Build context for a single source.

    Args:
        source_id: ID of the source
        max_tokens: Optional token limit

    Returns:
        Built context
    """
    builder = ContextBuilder(
        source_id=source_id, max_tokens=max_tokens
    )
    return await builder.build()


async def build_mixed_context(
    source_ids: Optional[List[str]] = None,
    note_ids: Optional[List[str]] = None,
    project_id: Optional[str] = None,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Build context from mixed sources.

    Args:
        source_ids: List of source IDs
        note_ids: List of note IDs
        project_id: Optional Project ID
        max_tokens: Optional token limit

    Returns:
        Built context
    """
    context_config = ContextConfig(max_tokens=max_tokens)

    # Configure sources
    if source_ids:
        context_config.sources = {sid: "full content" for sid in source_ids}

    # Configure notes
    if note_ids:
        context_config.notes = {nid: "full content" for nid in note_ids}

    builder = ContextBuilder(
        project_id=project_id, context_config=context_config, max_tokens=max_tokens
    )
    return await builder.build()
