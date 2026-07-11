"""
Artifacts service layer using API.
"""

from datetime import datetime
from typing import Any, Dict, List, Union

from loguru import logger

from api.client import api_client
from construction_os.domain.artifact import Artifact


class ArtifactsService:
    """Service layer for Artifacts operations using API."""

    def __init__(self):
        logger.info("Using API for Artifacts operations")

    def get_all_artifacts(self) -> List[Artifact]:
        """Get all Artifacts."""
        artifacts_data = api_client.get_artifacts()
        artifacts = []
        for artifact_data in artifacts_data:
            artifact = Artifact(
                name=artifact_data["name"],
                title=artifact_data["title"],
                description=artifact_data["description"],
                prompt=artifact_data["prompt"],
                apply_default=artifact_data["apply_default"],
            )
            artifact.id = artifact_data["id"]
            artifact.created = datetime.fromisoformat(
                artifact_data["created"].replace("Z", "+00:00")
            )
            artifact.updated = datetime.fromisoformat(
                artifact_data["updated"].replace("Z", "+00:00")
            )
            artifacts.append(artifact)
        return artifacts

    def get_artifact(self, artifact_id: str) -> Artifact:
        """Get a specific Artifact."""
        response = api_client.get_artifact(artifact_id)
        artifact_data = response if isinstance(response, dict) else response[0]
        artifact = Artifact(
            name=artifact_data["name"],
            title=artifact_data["title"],
            description=artifact_data["description"],
            prompt=artifact_data["prompt"],
            apply_default=artifact_data["apply_default"],
        )
        artifact.id = artifact_data["id"]
        artifact.created = datetime.fromisoformat(
            artifact_data["created"].replace("Z", "+00:00")
        )
        artifact.updated = datetime.fromisoformat(
            artifact_data["updated"].replace("Z", "+00:00")
        )
        return artifact

    def create_artifact(
        self,
        name: str,
        title: str,
        description: str,
        prompt: str,
        apply_default: bool = False,
    ) -> Artifact:
        """Create a new Artifact."""
        response = api_client.create_artifact(
            name=name,
            title=title,
            description=description,
            prompt=prompt,
            apply_default=apply_default,
        )
        artifact_data = response if isinstance(response, dict) else response[0]
        artifact = Artifact(
            name=artifact_data["name"],
            title=artifact_data["title"],
            description=artifact_data["description"],
            prompt=artifact_data["prompt"],
            apply_default=artifact_data["apply_default"],
        )
        artifact.id = artifact_data["id"]
        artifact.created = datetime.fromisoformat(
            artifact_data["created"].replace("Z", "+00:00")
        )
        artifact.updated = datetime.fromisoformat(
            artifact_data["updated"].replace("Z", "+00:00")
        )
        return artifact

    def update_artifact(self, artifact: Artifact) -> Artifact:
        """Update an Artifact."""
        if not artifact.id:
            raise ValueError("Artifact ID is required for update")

        updates = {
            "name": artifact.name,
            "title": artifact.title,
            "description": artifact.description,
            "prompt": artifact.prompt,
            "apply_default": artifact.apply_default,
        }
        response = api_client.update_artifact(artifact.id, **updates)
        artifact_data = response if isinstance(response, dict) else response[0]

        artifact.name = artifact_data["name"]
        artifact.title = artifact_data["title"]
        artifact.description = artifact_data["description"]
        artifact.prompt = artifact_data["prompt"]
        artifact.apply_default = artifact_data["apply_default"]
        artifact.updated = datetime.fromisoformat(
            artifact_data["updated"].replace("Z", "+00:00")
        )

        return artifact

    def delete_artifact(self, artifact_id: str) -> bool:
        """Delete an Artifact."""
        api_client.delete_artifact(artifact_id)
        return True

    def execute_artifact(
        self, artifact_id: str, input_text: str, model_id: str
    ) -> Union[Dict[Any, Any], List[Dict[Any, Any]]]:
        """Execute an Artifact on input text."""
        return api_client.execute_artifact(
            artifact_id=artifact_id,
            input_text=input_text,
            model_id=model_id,
        )


# Global service instance
artifacts_service = ArtifactsService()
