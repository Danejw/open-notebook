"""Unit tests for knowledge graph helpers."""

from construction_os.domain.knowledge_graph import normalize_entity_key
from construction_os.knowledge.extractors.base import ExtractionPayload
from construction_os.knowledge.extractors.registry import get_extractor, list_extractors


def test_normalize_entity_key():
    assert normalize_entity_key('AHU-2') == 'ahu 2'
    assert normalize_entity_key('  Room 201!! ') == 'room 201'
    assert normalize_entity_key('09 30 00') == '09 30 00'


def test_extractor_registry():
    ids = {e['id'] for e in list_extractors()}
    assert ids == {'generic', 'contract', 'drawing', 'spec', 'email'}
    generic = get_extractor('generic')
    assert generic.auto_run is True
    assert get_extractor('drawing').auto_run is False


def test_extraction_payload_defaults():
    payload = ExtractionPayload()
    assert payload.entities == []
    assert payload.claims == []
