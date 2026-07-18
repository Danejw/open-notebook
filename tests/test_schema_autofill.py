"""Unit tests for schema autofill helpers."""

from construction_os.exceptions import InvalidInputError
from construction_os.services.schema_autofill import _combine_texts, _validate_data, _validate_schema
import pytest


def test_validate_schema_rejects_non_object_type():
    with pytest.raises(InvalidInputError):
        _validate_schema({"type": "array"})


def test_validate_data_against_schema():
    schema = {
        "type": "object",
        "properties": {"name": {"type": "string"}},
        "required": ["name"],
    }
    assert _validate_data({"name": "Acme"}, schema)["name"] == "Acme"
    with pytest.raises(InvalidInputError):
        _validate_data({}, schema)


def test_combine_texts_truncates_with_warning():
    huge = "x" * 30_000
    combined, warnings = _combine_texts([("big.pdf", huge)])
    assert len(combined) <= 24_000 + len("# FILE: big.pdf\n\n")
    assert warnings
