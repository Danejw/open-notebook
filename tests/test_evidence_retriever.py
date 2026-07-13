"""Unit tests for evidence retriever fusion and routing heuristics."""

from construction_os.retrieval.evidence_retriever import (
    reciprocal_rank_fusion,
    should_use_hybrid,
)
from construction_os.retrieval.types import EvidenceItem


def test_should_use_hybrid_for_identifiers():
    assert should_use_hybrid('Where is detail 3/A-501 referenced?')
    assert should_use_hybrid('CSI section 09 30 00 waterproofing')
    assert should_use_hybrid('AHU-2 capacity')
    assert should_use_hybrid('open RFI-12 status')
    assert should_use_hybrid('what does "vapor barrier" mean in notes')


def test_should_not_force_hybrid_for_plain_semantic():
    assert not should_use_hybrid('What is the warranty period for roofing?')
    assert not should_use_hybrid('Summarize the project goals')


def test_reciprocal_rank_fusion_dedupes_and_orders():
    list_a = [
        EvidenceItem(id='source:1', parent_id='source:1', title='A', score=0.9, source='vector'),
        EvidenceItem(id='source:2', parent_id='source:2', title='B', score=0.8, source='vector'),
    ]
    list_b = [
        EvidenceItem(id='source:2', parent_id='source:2', title='B', score=5.0, source='text'),
        EvidenceItem(id='source:3', parent_id='source:3', title='C', score=4.0, source='text'),
    ]
    fused = reciprocal_rank_fusion([list_a, list_b])
    ids = [item.id for item in fused]
    assert ids[0] == 'source:2'  # appears in both lists
    assert set(ids) == {'source:1', 'source:2', 'source:3'}
    assert len(fused) == 3
