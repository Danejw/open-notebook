# Load environment variables
from dotenv import load_dotenv

load_dotenv()

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.auth import PasswordAuthMiddleware
from api.routers import (
    auth,
    chat,
    config,
    context,
    credentials,
    embedding,
    embedding_rebuild,
    episode_profiles,
    insights,
    knowledge_graph,
    languages,
    mcp,
    models,
    projects,
    notes,
    podcasts,
    search,
    settings,
    skills,
    source_chat,
    sources,
    speaker_profiles,
    artifacts,
)
from api.routers import commands as commands_router
from construction_os.database.async_migrate import AsyncMigrationManager
from construction_os.exceptions import (
    AuthenticationError,
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    NetworkError,
    NotFoundError,
    ConstructionOSError,
    RateLimitError,
)
from construction_os.utils.encryption import get_secret_from_env


def _parse_cors_origins(raw: str) -> list[str]:
    """Parse CORS_ORIGINS env value into a list of origins."""
    value = raw.strip()
    if value == "*":
        return ["*"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


# Parsed once at module load; CORS_ORIGINS changes require a restart.
_cors_origins_raw = os.getenv("CORS_ORIGINS")
CORS_ALLOWED_ORIGINS = _parse_cors_origins(_cors_origins_raw or "*")
CORS_IS_DEFAULT_WILDCARD = _cors_origins_raw is None


def _cors_headers(request: Request) -> dict[str, str]:
    """
    Build CORS headers for error responses.

    Mirrors Starlette CORSMiddleware behavior: reflects the request Origin
    when the origin is allowed (or when wildcard is configured, since
    browsers reject `Access-Control-Allow-Origin: *` combined with
    credentials). Omits `Access-Control-Allow-Origin` for disallowed
    origins so the browser blocks the error body from leaking cross-origin.
    """
    origin = request.headers.get("origin")
    headers: dict[str, str] = {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }

    if origin and ("*" in CORS_ALLOWED_ORIGINS or origin in CORS_ALLOWED_ORIGINS):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Vary"] = "Origin"

    return headers


# Import commands to register them in the API process
try:
    logger.info("Commands imported in API process")
except Exception as e:
    logger.error(f"Failed to import commands in API process: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler for the FastAPI application.
    Runs database migrations automatically on startup.
    """
    # Startup: Security checks
    logger.info("Starting API initialization...")

    # Security check: Encryption key
    if not get_secret_from_env("CONSTRUCTION_OS_ENCRYPTION_KEY"):
        logger.warning(
            "CONSTRUCTION_OS_ENCRYPTION_KEY not set. "
            "API key encryption will fail until this is configured. "
            "Set CONSTRUCTION_OS_ENCRYPTION_KEY to any secret string."
        )

    # Run database migrations

    try:
        migration_manager = AsyncMigrationManager()
        current_version = await migration_manager.get_current_version()
        logger.info(f"Current database version: {current_version}")

        if await migration_manager.needs_migration():
            logger.warning("Database migrations are pending. Running migrations...")
            await migration_manager.run_migration_up()
            new_version = await migration_manager.get_current_version()
            logger.success(
                f"Migrations completed successfully. Database is now at version {new_version}"
            )
        else:
            logger.info(
                "Database is already at the latest version. No migrations needed."
            )
    except Exception as e:
        logger.error(f"CRITICAL: Database migration failed: {str(e)}")
        logger.exception(e)
        # Fail fast - don't start the API with an outdated database schema
        raise RuntimeError(f"Failed to run database migrations: {str(e)}") from e

    # Run Construction OS rebrand data migrations (notebook→project, transformation→artifact)
    try:
        from construction_os.database.rebrand_migration import run_construction_os_rebrand

        await run_construction_os_rebrand()
    except Exception as e:
        logger.error(f"Construction OS rebrand migration failed: {e}")
        logger.exception(e)
        raise RuntimeError(f"Failed to run Construction OS rebrand migration: {e}") from e

    # Copy legacy open_notebook namespace data into construction_os when needed
    try:
        from construction_os.database.namespace_migration import migrate_legacy_namespace_if_needed

        await migrate_legacy_namespace_if_needed()
    except Exception as e:
        logger.error(f"Namespace migration failed: {e}")
        logger.exception(e)
        raise RuntimeError(f"Failed to run namespace migration: {e}") from e

    # Run podcast profile data migration (legacy strings -> Model registry)
    try:
        from construction_os.podcasts.migration import migrate_podcast_profiles

        await migrate_podcast_profiles()
    except Exception as e:
        logger.warning(f"Podcast profile migration encountered errors: {e}")
        # Non-fatal: profiles can be migrated manually via UI

    # AsyncSqliteSaver for chat graphs (required by ag-ui-langgraph aget_state/astream)
    try:
        from api.ag_ui_agents import refresh_agents
        from construction_os.graphs import chat as chat_module
        from construction_os.graphs import source_chat as source_chat_module
        from construction_os.graphs.checkpointer import init_checkpointer

        checkpointer = await init_checkpointer()
        chat_module.bind_checkpointer(checkpointer)
        source_chat_module.bind_checkpointer(checkpointer)
        refresh_agents()
        logger.success("LangGraph AsyncSqliteSaver checkpointer ready")
    except Exception as e:
        logger.error(f"CRITICAL: Failed to initialize LangGraph checkpointer: {e}")
        logger.exception(e)
        raise RuntimeError(f"Failed to initialize LangGraph checkpointer: {str(e)}") from e

    logger.success("API initialization completed successfully")

    # Yield control to the application
    yield

    # Shutdown: cleanup if needed
    try:
        from construction_os.graphs.checkpointer import close_checkpointer

        await close_checkpointer()
    except Exception as e:
        logger.warning(f"Error closing LangGraph checkpointer: {e}")
    logger.info("API shutdown complete")


app = FastAPI(
    title="Construction OS API",
    description="API for Construction OS - Research Assistant",
    lifespan=lifespan,
)

if CORS_IS_DEFAULT_WILDCARD:
    logger.warning(
        "CORS_ORIGINS is not set — API accepts cross-origin requests from any "
        "origin (default: '*'). For production deployments, set CORS_ORIGINS to "
        "your frontend origin(s), e.g. "
        "CORS_ORIGINS=https://app.example.com"
    )
else:
    logger.info(f"CORS allowed origins: {CORS_ALLOWED_ORIGINS}")

# Add password authentication middleware first
# Exclude /api/auth/status and /api/config from authentication
app.add_middleware(
    PasswordAuthMiddleware,
    excluded_paths=[
        "/",
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/api/auth/status",
        "/api/config",
    ],
)

# Add CORS middleware last (so it processes first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Custom exception handler to ensure CORS headers are included in error responses
# This helps when errors occur before the CORS middleware can process them
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Custom exception handler that ensures CORS headers are included in error responses.
    This is particularly important for 413 (Payload Too Large) errors during file uploads.

    Note: If a reverse proxy (nginx, traefik) returns 413 before the request reaches
    FastAPI, this handler won't be called. In that case, configure your reverse proxy
    to add CORS headers to error responses.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={**(exc.headers or {}), **_cors_headers(request)},
    )


@app.exception_handler(NotFoundError)
async def not_found_error_handler(request: Request, exc: NotFoundError):
    return JSONResponse(
        status_code=404,
        content={"detail": str(exc)},
        headers=_cors_headers(request),
    )


@app.exception_handler(InvalidInputError)
async def invalid_input_error_handler(request: Request, exc: InvalidInputError):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)},
        headers=_cors_headers(request),
    )


@app.exception_handler(AuthenticationError)
async def authentication_error_handler(request: Request, exc: AuthenticationError):
    return JSONResponse(
        status_code=401,
        content={"detail": str(exc)},
        headers=_cors_headers(request),
    )


@app.exception_handler(RateLimitError)
async def rate_limit_error_handler(request: Request, exc: RateLimitError):
    return JSONResponse(
        status_code=429,
        content={"detail": str(exc)},
        headers=_cors_headers(request),
    )


@app.exception_handler(ConfigurationError)
async def configuration_error_handler(request: Request, exc: ConfigurationError):
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc)},
        headers=_cors_headers(request),
    )


@app.exception_handler(NetworkError)
async def network_error_handler(request: Request, exc: NetworkError):
    return JSONResponse(
        status_code=502,
        content={"detail": str(exc)},
        headers=_cors_headers(request),
    )


@app.exception_handler(ExternalServiceError)
async def external_service_error_handler(request: Request, exc: ExternalServiceError):
    return JSONResponse(
        status_code=502,
        content={"detail": str(exc)},
        headers=_cors_headers(request),
    )


@app.exception_handler(ConstructionOSError)
async def construction_os_error_handler(request: Request, exc: ConstructionOSError):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers=_cors_headers(request),
    )


# Include routers
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(projects.router, prefix="/api", tags=["projects"])
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(models.router, prefix="/api", tags=["models"])
app.include_router(artifacts.router, prefix="/api", tags=["artifacts"])
app.include_router(skills.router, prefix="/api", tags=["skills"])
app.include_router(mcp.router, prefix="/api", tags=["mcp"])
app.include_router(notes.router, prefix="/api", tags=["notes"])
app.include_router(embedding.router, prefix="/api", tags=["embedding"])
app.include_router(
    embedding_rebuild.router, prefix="/api/embeddings", tags=["embeddings"]
)
app.include_router(settings.router, prefix="/api", tags=["settings"])
app.include_router(context.router, prefix="/api", tags=["context"])
app.include_router(sources.router, prefix="/api", tags=["sources"])
app.include_router(insights.router, prefix="/api", tags=["insights"])
app.include_router(knowledge_graph.router, prefix="/api", tags=["knowledge-graph"])
app.include_router(commands_router.router, prefix="/api", tags=["commands"])
app.include_router(podcasts.router, prefix="/api", tags=["podcasts"])
app.include_router(episode_profiles.router, prefix="/api", tags=["episode-profiles"])
app.include_router(speaker_profiles.router, prefix="/api", tags=["speaker-profiles"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(source_chat.router, prefix="/api", tags=["source-chat"])
app.include_router(credentials.router, prefix="/api", tags=["credentials"])
app.include_router(languages.router, prefix="/api", tags=["languages"])


@app.get("/")
async def root():
    return {"message": "Construction OS API is running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
