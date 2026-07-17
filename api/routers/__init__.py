"""API router package composition.

The application currently registers the projects router explicitly in ``api.main``.
Mount the Opportunity Hub beneath that registered router so the feature remains
self-contained and does not duplicate the global ``/api`` prefix.
"""

from api.routers import opportunities as opportunities
from api.routers import projects as projects

projects.router.include_router(opportunities.router, tags=["opportunities"])

__all__ = ["opportunities", "projects"]
