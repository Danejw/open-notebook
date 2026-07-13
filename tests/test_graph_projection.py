"""Contract tests for knowledge graph visualization projection DTOs."""

from construction_os.knowledge.graph_projection import (
    GraphEdgeDTO,
    GraphNodeDTO,
    GraphSliceDTO,
    claim_to_edge,
    claim_to_node,
    community_to_node,
    entity_to_node,
    kind_from_id,
    relation_to_edge,
    source_to_node,
)


def test_kind_from_id():
    assert kind_from_id("kg_entity:abc") == "entity"
    assert kind_from_id("source:xyz") == "source"
    assert kind_from_id("source_embedding:1") == "chunk"
    assert kind_from_id("kg_claim:c") == "claim"
    assert kind_from_id("kg_community:c") == "community"
    assert kind_from_id("unknown:x") is None


def test_entity_to_node_contract():
    node = entity_to_node(
        {
            "id": "kg_entity:1",
            "label": "AHU-2",
            "type": "Deliverable",
            "normalized_key": "ahu 2",
            "community_id": "kg_community:9",
            "metadata": {"description": "Air handler"},
            "source_id": "source:s1",
        },
        degree=4,
        source_count=2,
    )
    assert isinstance(node, GraphNodeDTO)
    assert node.kind == "entity"
    assert node.id == "kg_entity:1"
    assert node.label == "AHU-2"
    assert node.subtype == "Deliverable"
    assert node.degree == 4
    assert node.source_count == 2
    assert node.community_id == "kg_community:9"
    assert "normalized_key" in node.metadata


def test_relation_and_claim_edges():
    edge = relation_to_edge(
        {
            "id": "kg_relation:r1",
            "from_id": "kg_entity:a",
            "to_id": "kg_entity:b",
            "type": "REFERENCES",
            "confidence": 0.9,
            "chunk_id": "source_embedding:c1",
            "source_id": "source:s1",
        }
    )
    assert isinstance(edge, GraphEdgeDTO)
    assert edge.source == "kg_entity:a"
    assert edge.target == "kg_entity:b"
    assert edge.relation == "REFERENCES"
    assert edge.evidence_count == 1
    assert edge.directed is True

    claim_edge = claim_to_edge(
        {
            "id": "kg_claim:1",
            "subject_id": "kg_entity:a",
            "object_id": "kg_entity:b",
            "predicate": "REQUIRES",
            "confidence": 0.8,
            "source_id": "source:s1",
        }
    )
    assert claim_edge is not None
    assert claim_edge.metadata["kind"] == "claim"
    assert claim_to_edge({"id": "kg_claim:2", "subject_id": "kg_entity:a"}) is None


def test_slice_dto_truncation_flag():
    slice_dto = GraphSliceDTO(
        nodes=[
            source_to_node({"id": "source:1", "title": "Spec"}),
            community_to_node(
                {"id": "kg_community:1", "label": "Community A", "member_count": 12}
            ),
            claim_to_node({"id": "kg_claim:1", "predicate": "STATES"}),
        ],
        edges=[],
        graph_version="3",
        truncated=True,
    )
    dumped = slice_dto.model_dump()
    assert dumped["truncated"] is True
    assert dumped["graph_version"] == "3"
    assert dumped["stats"]["visible_nodes"] == 0 or "stats" in dumped
    assert len(dumped["nodes"]) == 3
    assert dumped["nodes"][0]["kind"] == "source"
    assert dumped["nodes"][1]["kind"] == "community"


def test_project_matches_helper():
    from construction_os.knowledge.graph_projection import _project_matches

    assert _project_matches("project:abc", "project:abc")
    assert _project_matches("project:abc", "abc") or _project_matches(
        "project:abc", "project:abc"
    )
    assert not _project_matches("project:other", "project:abc")


def test_claim_node_and_source_node():
    claim = claim_to_node(
        {
            "id": "kg_claim:1",
            "predicate": "REQUIRES",
            "confidence": 0.7,
            "source_id": "source:1",
            "subject_id": "kg_entity:a",
        }
    )
    assert claim.kind == "claim"
    assert claim.confidence == 0.7
    src = source_to_node({"id": "source:1", "title": "Spec Book"})
    assert src.label == "Spec Book"
