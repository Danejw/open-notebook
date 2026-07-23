from typing import Optional

from fastapi import APIRouter, HTTPException
from loguru import logger

from api.models import SearchRequest, SearchResponse
from construction_os.ai.models import model_manager
from construction_os.domain.project import text_search, vector_search
from construction_os.exceptions import DatabaseOperationError, InvalidInputError
from construction_os.retrieval import retrieve

router = APIRouter()


@router.post("/search", response_model=SearchResponse)
async def search_knowledge_base(search_request: SearchRequest):
    """Search the knowledge base.

    Modes (RAG-005 / RAG-014):
    - auto (default): retrieve(mode=\"auto\") — same heuristics as project chat
    - hybrid: BM25 + vector via retrieve(mode=\"hybrid\")
    - vector: dense similarity only (explicit; no RRF)
    - text: keyword/BM25 only
    """
    try:
        retrieval_mode_used: Optional[str] = None

        if search_request.type in ("hybrid", "auto"):
            if not await model_manager.get_embedding_model():
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{search_request.type.capitalize()} search requires an "
                        "embedding model. Please configure one in the Models section."
                    ),
                )
            mode = "hybrid" if search_request.type == "hybrid" else "auto"
            bundle = await retrieve(
                search_request.query,
                project_id=search_request.project_id,
                mode=mode,  # type: ignore[arg-type]
                limit=search_request.limit,
                search_sources=search_request.search_sources,
                search_notes=search_request.resolve_search_artifacts(),
                minimum_score=search_request.minimum_score,
            )
            results = bundle.to_search_results()
            retrieval_mode_used = bundle.retrieval_mode_used
        elif search_request.type == "vector":
            # Pure vector — intentionally skips hybrid RRF (use hybrid/auto instead).
            if not await model_manager.get_embedding_model():
                raise HTTPException(
                    status_code=400,
                    detail="Vector search requires an embedding model. Please configure one in the Models section.",
                )

            results = await vector_search(
                keyword=search_request.query,
                results=search_request.limit,
                source=search_request.search_sources,
                note=search_request.resolve_search_artifacts(),
                minimum_score=search_request.minimum_score,
                project_id=search_request.project_id,
            )
        else:
            # Text search
            results = await text_search(
                keyword=search_request.query,
                results=search_request.limit,
                source=search_request.search_sources,
                note=search_request.resolve_search_artifacts(),
                project_id=search_request.project_id,
            )

        return SearchResponse(
            results=results or [],
            total_count=len(results) if results else 0,
            search_type=search_request.type,
            retrieval_mode_used=retrieval_mode_used,
        )
    except DatabaseOperationError as e:
        logger.error(f"Database error during search: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    except InvalidInputError as e:
        logger.error(f"Invalid input during search: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during search: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
