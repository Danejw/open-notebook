"""
Project service layer using API.
"""

from typing import List, Optional

from loguru import logger

from api.client import api_client
from construction_os.domain.project import Project


class ProjectService:
    """Service layer for Project operations using API."""

    def __init__(self):
        logger.info("Using API for Project operations")

    def get_all_projects(self, order_by: str = "updated desc") -> List[Project]:
        """Get all projects."""
        projects_data = api_client.get_projects(order_by=order_by)
        projects = []
        for project_data in projects_data:
            project = Project(
                name=project_data["name"],
                description=project_data["description"],
                archived=project_data["archived"],
            )
            project.id = project_data["id"]
            project.created = project_data["created"]
            project.updated = project_data["updated"]
            projects.append(project)
        return projects

    def get_project(self, project_id: str) -> Optional[Project]:
        """Get a specific Project."""
        response = api_client.get_project(project_id)
        project_data = response if isinstance(response, dict) else response[0]
        project = Project(
            name=project_data["name"],
            description=project_data["description"],
            archived=project_data["archived"],
        )
        project.id = project_data["id"]
        project.created = project_data["created"]
        project.updated = project_data["updated"]
        return project

    def create_project(self, name: str, description: str = "") -> Project:
        """Create a new Project."""
        response = api_client.create_project(name, description)
        project_data = response if isinstance(response, dict) else response[0]
        project = Project(
            name=project_data["name"],
            description=project_data["description"],
            archived=project_data["archived"],
        )
        project.id = project_data["id"]
        project.created = project_data["created"]
        project.updated = project_data["updated"]
        return project

    def update_project(self, project: Project) -> Project:
        """Update a Project."""
        updates = {
            "name": project.name,
            "description": project.description,
            "archived": project.archived,
        }
        response = api_client.update_project(project.id or "", **updates)
        project_data = response if isinstance(response, dict) else response[0]
        project.name = project_data["name"]
        project.description = project_data["description"]
        project.archived = project_data["archived"]
        project.updated = project_data["updated"]
        return project

    def delete_project(self, project: Project) -> bool:
        """Delete a Project."""
        api_client.delete_project(project.id or "")
        return True


# Global service instance
project_service = ProjectService()
