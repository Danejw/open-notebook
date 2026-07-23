import os
from datetime import datetime
from pathlib import Path
from typing import Any, ClassVar, Dict, List, Literal, Optional, Tuple, Union

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, field_validator
from surrealdb import RecordID

from construction_os.database.repository import ensure_record_id, repo_query
from construction_os.domain.base import ObjectModel
from construction_os.domain.chat_queue import ChatQueueRepository
from construction_os.domain.project_artifact import Note, ProjectArtifact
from construction_os.exceptions import DatabaseOperationError, InvalidInputError

# SurrealQL: classify sources linked to a project as exclusive (no other projects)
# or shared. Safe when the project has zero sources (empty FROM yields no rows).
_SOURCE_ASSIGNMENT_QUERY = """
SELECT
    id,
    count(->reference[WHERE out != $project_id].out) AS assigned_others
FROM (SELECT VALUE in FROM reference WHERE out = $project_id)
"""


class Project(ObjectModel):
    table_name: ClassVar[str] = "project"
    name: str
    description: str
    archived: Optional[bool] = False
    graph_version: Optional[int] = 0
    nullable_fields: ClassVar[set[str]] = {"archived", "graph_version"}

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, v):
        if not v.strip():
            raise InvalidInputError("Project name cannot be empty")
        return v

    async def get_sources(self, include_full_text: bool = False) -> List["Source"]:
        try:
            source_projection = "" if include_full_text else " omit source.full_text"
            srcs = await repo_query(
                f"""
                select *{source_projection} from (
                select in as source from reference where out=$id
                fetch source
            ) order by source.updated desc
            """,
                {"id": ensure_record_id(self.id)},
            )
            return [Source(**src["source"]) for src in srcs] if srcs else []
        except Exception as e:
            logger.error(f"Error fetching sources for Project {self.id}: {str(e)}")
            logger.exception(e)
            raise DatabaseOperationError(e)

    async def get_notes(self, include_content: bool = False) -> List["Note"]:
        try:
            note_projection = (
                " omit note.embedding"
                if include_content
                else " omit note.content, note.embedding"
            )
            srcs = await repo_query(
                f"""
            select *{note_projection} from (
                select in as note FROM project_note WHERE out=$id
                fetch note
            ) order by note.updated desc
            """,
                {"id": ensure_record_id(self.id)},
            )
            return [Note(**src["note"]) for src in srcs] if srcs else []
        except Exception as e:
            logger.error(f"Error fetching notes for Project {self.id}: {str(e)}")
            logger.exception(e)
            raise DatabaseOperationError(e)

    async def get_artifacts(self, include_content: bool = False) -> List[ProjectArtifact]:
        """Alias for get_notes — project artifacts are stored in the note table."""
        return await self.get_notes(include_content=include_content)

    async def get_context(self) -> str:
        """
        Build long-form Project context for podcast and LLM workflows.

        Normal list retrieval omits large source/note bodies, so this method uses
        opt-in full-content fetches and formats only substantive context blocks.
        """
        sources = await self.get_sources(include_full_text=True)
        notes = await self.get_notes(include_content=True)
        context_blocks = []

        for source in sources:
            source_context = await source.get_context(context_size="long")
            if isinstance(source_context, dict):
                title = source_context.get("title") or source.title or "Untitled source"
                full_text = source_context.get("full_text")
                content = str(full_text).strip() if full_text else ""
            else:
                title = source.title or "Untitled source"
                content = str(source_context).strip()

            if content:
                context_blocks.append(f"## Source: {title}\n\n{content}")

        for note in notes:
            note_context = note.get_context(context_size="long")
            if isinstance(note_context, dict):
                title = note_context.get("title") or note.title or "Untitled note"
                content = note_context.get("content")
                content = str(content).strip() if content else ""
            else:
                title = note.title or "Untitled note"
                content = str(note_context).strip()

            if content:
                context_blocks.append(f"## Artifact: {title}\n\n{content}")

        return "\n\n".join(context_blocks)

    async def get_chat_sessions(self) -> List["ChatSession"]:
        try:
            srcs = await repo_query(
                """
                select * from (
                    select
                    <- chat_session as chat_session
                    from refers_to
                    where out=$id
                    fetch chat_session
                )
                order by chat_session.updated desc
            """,
                {"id": ensure_record_id(self.id)},
            )
            return (
                [ChatSession(**src["chat_session"][0]) for src in srcs] if srcs else []
            )
        except Exception as e:
            logger.error(
                f"Error fetching chat sessions for Project {self.id}: {str(e)}"
            )
            logger.exception(e)
            raise DatabaseOperationError(e)

    async def get_delete_preview(self) -> Dict[str, Any]:
        """
        Get counts of items that would be affected by deleting this Project.

        Returns a dict with:
        - note_count: Number of notes that will be deleted
        - exclusive_source_count: Sources only in this Project (can be deleted)
        - shared_source_count: Sources in other projects (will be unlinked only)
        """
        try:
            project_id = ensure_record_id(self.id)

            # Count notes
            note_result = await repo_query(
                "SELECT count() as count FROM project_note WHERE out = $project_id GROUP ALL",
                {"project_id": project_id},
            )
            note_count = note_result[0]["count"] if note_result else 0

            # Classify sources: assigned_others = 0 means exclusive to this Project
            source_counts = await repo_query(
                _SOURCE_ASSIGNMENT_QUERY,
                {"project_id": project_id},
            )

            exclusive_count = 0
            shared_count = 0
            for src in source_counts or []:
                if src.get("assigned_others", 0) == 0:
                    exclusive_count += 1
                else:
                    shared_count += 1

            return {
                "note_count": note_count,
                "exclusive_source_count": exclusive_count,
                "shared_source_count": shared_count,
            }
        except Exception as e:
            logger.error(f"Error getting delete preview for Project {self.id}: {e}")
            logger.exception(e)
            raise DatabaseOperationError(e)

    async def delete(self, delete_exclusive_sources: bool = False) -> Dict[str, int]:
        """
        Delete Project with cascade deletion of linked data and optional source deletion.

        Always removes: artifacts, chat sessions/queues, documents, knowledge graph,
        drawing data, opportunity links, and source reference edges.
        Optionally deletes exclusive sources when ``delete_exclusive_sources`` is True.

        Args:
            delete_exclusive_sources: If True, also delete sources that belong
                                     only to this Project. Default is False.

        Returns:
            Dict with counts: deleted_notes, deleted_sources, unlinked_sources
        """
        if self.id is None:
            raise InvalidInputError("Cannot delete project without an ID")

        try:
            project_id = ensure_record_id(self.id)
            project_id_str = str(self.id)
            deleted_notes = 0
            deleted_sources = 0
            unlinked_sources = 0

            # 1. Delete all notes/artifacts linked to this Project
            notes = await self.get_notes()
            for note in notes:
                await note.delete()
                deleted_notes += 1
            logger.info(f"Deleted {deleted_notes} notes for Project {self.id}")

            await repo_query(
                "DELETE project_note WHERE out = $project_id",
                {"project_id": project_id},
            )

            # 2. Chat sessions, queues, and refers_to edges
            sessions = await self.get_chat_sessions()
            for session in sessions:
                if not session.id:
                    continue
                try:
                    await ChatQueueRepository.delete_for_session(session.id)
                    await session.delete()
                except Exception as e:
                    logger.warning(
                        f"Failed to delete chat session {session.id} "
                        f"for Project {self.id}: {e}"
                    )
            await repo_query(
                "DELETE refers_to WHERE out = $project_id",
                {"project_id": project_id},
            )

            # 3. HTML documents (project_id stored as string)
            await repo_query(
                "DELETE document WHERE project_id = $project_id_str",
                {"project_id_str": project_id_str},
            )

            # 4. Knowledge graph rows
            await repo_query(
                """
                DELETE kg_mention WHERE project_id = $project_id;
                DELETE kg_claim WHERE project_id = $project_id;
                DELETE kg_relation WHERE project_id = $project_id;
                DELETE kg_entity WHERE project_id = $project_id;
                DELETE kg_community WHERE project_id = $project_id;
                DELETE kg_graph_layout WHERE project_id = $project_id;
                DELETE kg_query_run WHERE project_id = $project_id;
                DELETE kg_extraction_run WHERE project_id = $project_id;
                """,
                {"project_id": project_id},
            )

            # 5. Drawing extraction data
            await repo_query(
                """
                DELETE drawing_embedding WHERE project_id = $project_id;
                DELETE drawing_semantic_record WHERE project_id = $project_id;
                DELETE drawing_extraction_run WHERE project_id = $project_id;
                """,
                {"project_id": project_id},
            )

            # 6. Unlink opportunities (do not delete opportunity records)
            await repo_query(
                "UPDATE opportunity SET project_id = NONE WHERE project_id = $project_id_str",
                {"project_id_str": project_id_str},
            )

            # 7. Handle sources
            if delete_exclusive_sources:
                source_counts = await repo_query(
                    _SOURCE_ASSIGNMENT_QUERY,
                    {"project_id": project_id},
                )

                for src in source_counts or []:
                    source_id = src.get("id")
                    if source_id and src.get("assigned_others", 0) == 0:
                        try:
                            source = await Source.get(str(source_id))
                            await source.delete()
                            deleted_sources += 1
                        except Exception as e:
                            logger.warning(
                                f"Failed to delete exclusive source {source_id}: {e}"
                            )
                    else:
                        unlinked_sources += 1
            else:
                source_result = await repo_query(
                    "SELECT count() as count FROM reference WHERE out = $project_id GROUP ALL",
                    {"project_id": project_id},
                )
                unlinked_sources = source_result[0]["count"] if source_result else 0

            await repo_query(
                "DELETE reference WHERE out = $project_id",
                {"project_id": project_id},
            )
            logger.info(
                f"Unlinked {unlinked_sources} sources, deleted {deleted_sources} "
                f"exclusive sources for Project {self.id}"
            )

            # 8. Delete the Project record itself
            await super().delete()
            logger.info(f"Deleted Project {self.id}")

            return {
                "deleted_notes": deleted_notes,
                "deleted_sources": deleted_sources,
                "unlinked_sources": unlinked_sources,
            }

        except Exception as e:
            logger.error(f"Error deleting Project {self.id}: {e}")
            logger.exception(e)
            raise DatabaseOperationError(f"Failed to delete project: {e}")


class Asset(BaseModel):
    file_path: Optional[str] = None
    url: Optional[str] = None


class SourceEmbedding(ObjectModel):
    table_name: ClassVar[str] = "source_embedding"
    content: str
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    page: Optional[int] = None
    nullable_fields: ClassVar[set[str]] = {"char_start", "char_end", "page"}

    async def get_source(self) -> "Source":
        try:
            src = await repo_query(
                """
            select source.* from $id fetch source
            """,
                {"id": ensure_record_id(self.id)},
            )
            return Source(**src[0]["source"])
        except Exception as e:
            logger.error(f"Error fetching source for embedding {self.id}: {str(e)}")
            logger.exception(e)
            raise DatabaseOperationError(e)


class ProcessingFailure(BaseModel):
    """Latest user-visible failure recorded for one source processing stage."""

    stage: Literal["embedding", "knowledge_graph"]
    message: str
    error_type: Optional[str] = None
    occurred_at: datetime
    command_id: Optional[str] = None


class Source(ObjectModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    table_name: ClassVar[str] = "source"
    nullable_fields: ClassVar[set[str]] = {
        "asset",
        "title",
        "topics",
        "full_text",
        "content_hash",
        "command",
        "embed_command",
        "kg_command",
        "pipeline_stage",
        "processing_failures",
    }
    asset: Optional[Asset] = None
    title: Optional[str] = None
    topics: Optional[List[str]] = Field(default_factory=list)
    full_text: Optional[str] = None
    content_hash: Optional[str] = None
    command: Optional[Union[str, RecordID]] = Field(
        default=None, description="Link to surreal-commands processing job"
    )
    embed_command: Optional[Union[str, RecordID]] = Field(
        default=None, description="Link to embed_source job for pipeline tracking"
    )
    kg_command: Optional[Union[str, RecordID]] = Field(
        default=None,
        description="Link to build_knowledge_graph job for pipeline tracking",
    )
    pipeline_stage: Optional[str] = Field(
        default=None,
        description="Ingestion stage: extracting|embedding|knowledge_graph|completed|failed",
    )
    processing_failures: Dict[str, ProcessingFailure] = Field(
        default_factory=dict,
        description="Latest user-safe failure snapshot keyed by processing stage",
    )

    @field_validator("command", "embed_command", "kg_command", mode="before")
    @classmethod
    def parse_command(cls, value):
        """Parse command field to ensure RecordID format"""
        if isinstance(value, str) and value:
            return ensure_record_id(value)
        return value

    @field_validator("id", mode="before")
    @classmethod
    def parse_id(cls, value):
        """Parse id field to handle both string and RecordID inputs"""
        if value is None:
            return None
        if isinstance(value, RecordID):
            return str(value)
        return str(value) if value else None

    async def get_status(self) -> Optional[str]:
        """Get the processing status of the associated command"""
        if not self.command:
            return None

        try:
            from surreal_commands import get_command_status

            status = await get_command_status(str(self.command))
            return status.status if status else "unknown"
        except Exception as e:
            logger.warning(f"Failed to get command status for {self.command}: {e}")
            return "unknown"

    async def get_processing_progress(self) -> Optional[Dict[str, Any]]:
        """Get detailed processing information for the associated command"""
        if not self.command:
            return None

        try:
            from surreal_commands import get_command_status

            status_result = await get_command_status(str(self.command))
            if not status_result:
                return None

            # Extract execution metadata if available
            result = getattr(status_result, "result", None)
            execution_metadata = (
                result.get("execution_metadata", {}) if isinstance(result, dict) else {}
            )

            return {
                "status": status_result.status,
                "started_at": execution_metadata.get("started_at"),
                "completed_at": execution_metadata.get("completed_at"),
                "error": getattr(status_result, "error_message", None),
                "result": result,
            }
        except Exception as e:
            logger.warning(f"Failed to get command progress for {self.command}: {e}")
            return None

    async def get_context(
        self, context_size: Literal["short", "long"] = "short"
    ) -> Dict[str, Any]:
        if context_size == "long":
            return dict(
                id=self.id,
                title=self.title,
                full_text=self.full_text,
            )
        return dict(id=self.id, title=self.title)

    async def get_embedded_chunks(self) -> int:
        try:
            result = await repo_query(
                """
                select count() as chunks from source_embedding where source=$id GROUP ALL
                """,
                {"id": ensure_record_id(self.id)},
            )
            if len(result) == 0:
                return 0
            return result[0]["chunks"]
        except Exception as e:
            logger.error(f"Error fetching chunks count for source {self.id}: {str(e)}")
            logger.exception(e)
            raise DatabaseOperationError(f"Failed to count chunks for source: {str(e)}")

    async def add_to_project(self, project_id: str) -> Any:
        if not project_id:
            raise InvalidInputError("Project ID must be provided")
        return await self.relate("reference", project_id)

    async def vectorize(self, *, chain_kg: bool = True) -> str:
        """
        Submit vectorization as a background job using the embed_source command.

        Persists embed_command and sets pipeline_stage=embedding only after a
        successful job submit. Marks the pipeline failed if submit fails.

        Args:
            chain_kg: When True (default), continue into knowledge graph after
                embeddings. When False, only create embeddings.

        Returns:
            str: The command/job ID that can be used to track progress via the commands API

        Raises:
            ValueError: If source has no text to vectorize
            DatabaseOperationError: If job submission fails
        """
        from construction_os.knowledge.pipeline import begin_embed_stage

        if not self.full_text or not self.full_text.strip():
            raise ValueError(f"Source {self.id} has no text to vectorize")

        return await begin_embed_stage(str(self.id), chain_kg=chain_kg)

    def _prepare_save_data(self) -> dict:
        """Override to ensure command field is always RecordID format for database"""
        data = super()._prepare_save_data()

        # Ensure command field is RecordID format if not None
        if data.get("command") is not None:
            data["command"] = ensure_record_id(data["command"])

        return data

    async def delete(self) -> bool:
        """Delete source and clean up associated file and embeddings."""
        # Clean up uploaded file if it exists
        if self.asset and self.asset.file_path:
            file_path = Path(self.asset.file_path)
            if file_path.exists():
                try:
                    os.unlink(file_path)
                    logger.info(f"Deleted file for source {self.id}: {file_path}")
                except Exception as e:
                    logger.warning(
                        f"Failed to delete file {file_path} for source {self.id}: {e}. "
                        "Continuing with database deletion."
                    )
            else:
                logger.debug(
                    f"File {file_path} not found for source {self.id}, skipping cleanup"
                )

        # Delete associated embeddings to prevent orphaned records
        try:
            source_id = ensure_record_id(self.id)
            await repo_query(
                "DELETE source_embedding WHERE source = $source_id",
                {"source_id": source_id},
            )
            logger.debug(f"Deleted embeddings for source {self.id}")
        except Exception as e:
            logger.warning(
                f"Failed to delete embeddings for source {self.id}: {e}. "
                "Continuing with source deletion."
            )

        # Call parent delete to remove database record
        return await super().delete()


class ChatSession(ObjectModel):
    table_name: ClassVar[str] = "chat_session"
    nullable_fields: ClassVar[set[str]] = {
        "model_override",
        "skill_ids",
        "collection_ids",
        "html_template_id",
        "guest_key",
    }
    title: Optional[str] = None
    model_override: Optional[str] = None
    skill_ids: Optional[List[str]] = None
    collection_ids: Optional[List[str]] = None
    html_template_id: Optional[str] = None
    guest_key: Optional[str] = None

    async def relate_to_project(self, project_id: str) -> Any:
        if not project_id:
            raise InvalidInputError("Project ID must be provided")
        return await self.relate("refers_to", project_id)

    async def relate_to_source(self, source_id: str) -> Any:
        if not source_id:
            raise InvalidInputError("Source ID must be provided")
        return await self.relate("refers_to", source_id)


async def get_project_scope_ids(
    project_id: str,
) -> Tuple[set[str], set[str]]:
    """Return (source_ids, note_ids) linked to a project via graph edges."""
    project_rid = ensure_record_id(project_id)
    sources = await repo_query(
        "SELECT VALUE in FROM reference WHERE out = $project_id",
        {"project_id": project_rid},
    )
    notes = await repo_query(
        "SELECT VALUE in FROM project_note WHERE out = $project_id",
        {"project_id": project_rid},
    )
    source_ids = {str(s) for s in (sources or []) if s is not None}
    note_ids = {str(n) for n in (notes or []) if n is not None}
    return source_ids, note_ids


def filter_search_results_by_project(
    results: Optional[List[Dict[str, Any]]],
    source_ids: set[str],
    note_ids: set[str],
) -> List[Dict[str, Any]]:
    """Keep search hits that belong to the given project membership sets."""
    filtered: List[Dict[str, Any]] = []
    for result in results or []:
        rid = str(result.get("id") or "")
        parent = str(result.get("parent_id") or "")
        if rid.startswith("note:") or parent.startswith("note:"):
            if rid in note_ids or parent in note_ids:
                filtered.append(result)
            continue
        if rid in source_ids or parent in source_ids:
            filtered.append(result)
    return filtered


async def text_search(
    keyword: str,
    results: int,
    source: bool = True,
    note: bool = True,
    project_id: Optional[str] = None,
):
    if not keyword:
        raise InvalidInputError("Search keyword cannot be empty")
    try:
        fetch_limit = results
        source_ids: set[str] = set()
        note_ids: set[str] = set()
        if project_id:
            source_ids, note_ids = await get_project_scope_ids(project_id)
            # Over-fetch so project filtering still returns enough hits.
            fetch_limit = max(results * 5, 50)

        search_results = await repo_query(
            """
            select *
            from fn::text_search($keyword, $results, $source, $note)
            """,
            {
                "keyword": keyword,
                "results": fetch_limit,
                "source": source,
                "note": note,
            },
        )
        if project_id:
            search_results = filter_search_results_by_project(
                search_results, source_ids, note_ids
            )[:results]
        return search_results
    except RuntimeError as e:
        # SurrealDB's search::highlight can compute a byte position that exceeds the
        # stored string length on large or multi-byte chunks, aborting the whole query
        # ("position overflow"). Fall back to vector search so the user still gets
        # results instead of a 500. See issue #648.
        if "position overflow" in str(e):
            logger.warning(
                f"Highlight position overflow, falling back to vector search: {str(e)}"
            )
            try:
                return await vector_search(
                    keyword, results, source, note, project_id=project_id
                )
            except Exception as ve:
                # Both search paths failed (e.g. no embedding model configured).
                # Surface the failure instead of returning [] — an empty list would
                # be indistinguishable from a legitimate "no matches" and mask a
                # total search outage from callers.
                logger.error(f"Vector search fallback also failed: {str(ve)}")
                logger.exception(ve)
                raise DatabaseOperationError(ve)
        logger.error(f"Error performing text search: {str(e)}")
        logger.exception(e)
        raise DatabaseOperationError(e)
    except Exception as e:
        logger.error(f"Error performing text search: {str(e)}")
        logger.exception(e)
        raise DatabaseOperationError(e)


async def vector_search(
    keyword: str,
    results: int,
    source: bool = True,
    note: bool = True,
    minimum_score=0.2,
    project_id: Optional[str] = None,
):
    if not keyword:
        raise InvalidInputError("Search keyword cannot be empty")
    try:
        from construction_os.utils.embedding import generate_embedding

        fetch_limit = results
        source_ids: set[str] = set()
        note_ids: set[str] = set()
        if project_id:
            source_ids, note_ids = await get_project_scope_ids(project_id)
            fetch_limit = max(results * 5, 50)

        # Use unified embedding function (handles chunking if query is very long)
        embed = await generate_embedding(keyword)
        search_results = await repo_query(
            """
            SELECT * FROM fn::vector_search($embed, $results, $source, $note, $minimum_score);
            """,
            {
                "embed": embed,
                "results": fetch_limit,
                "source": source,
                "note": note,
                "minimum_score": minimum_score,
            },
        )
        if project_id:
            search_results = filter_search_results_by_project(
                search_results, source_ids, note_ids
            )[:results]
        return search_results
    except Exception as e:
        logger.error(f"Error performing vector search: {str(e)}")
        logger.exception(e)
        raise DatabaseOperationError(e)
