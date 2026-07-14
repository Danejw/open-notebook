"""HTML-native bid document templates and project document instances."""

from typing import ClassVar, Literal, Optional

from construction_os.domain.base import ObjectModel

HtmlTemplateCategory = Literal["estimate", "sow", "rfi", "other"]


class HtmlTemplate(ObjectModel):
    """Uploaded branded HTML used as a bid document template."""

    table_name: ClassVar[str] = "html_template"
    name: str
    category: HtmlTemplateCategory = "estimate"
    html_body: str


class Document(ObjectModel):
    """Project-scoped HTML document snapshot created from a template."""

    table_name: ClassVar[str] = "document"
    nullable_fields: ClassVar[set[str]] = {"template_id", "parent_document_id"}
    project_id: str
    template_id: Optional[str] = None
    title: str
    scenario_label: str = "Base"
    html_body: str
    parent_document_id: Optional[str] = None
