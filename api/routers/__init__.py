"""API router package composition.

The application currently registers the projects router explicitly in ``api.main``.
Mount the Opportunity Hub beneath that registered router so the feature remains
self-contained and does not duplicate the global ``/api`` prefix.
"""

from api.routers import opportunities as opportunities
from api.routers import opportunity_monitoring as opportunity_monitoring
from api.routers import projects as projects

projects.router.include_router(opportunities.router, tags=["opportunities"])
projects.router.include_router(
    opportunity_monitoring.router,
    tags=["opportunity-monitoring"],
)

__all__ = ["opportunities", "opportunity_monitoring", "projects"]
