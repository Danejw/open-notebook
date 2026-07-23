"""Architecture health guards for layer boundaries."""

from __future__ import annotations

import ast
from pathlib import Path


def test_source_ingest_has_no_api_imports():
    src = Path("construction_os/services/source_ingest.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                assert not alias.name.startswith("api"), alias.name
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            assert not mod.startswith("api"), mod


def test_construction_os_services_have_no_api_imports():
    root = Path("construction_os")
    offenders: list[str] = []
    for path in root.rglob("*.py"):
        if "migrations" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                if mod.startswith("api"):
                    offenders.append(f"{path}:{node.lineno}:{mod}")
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("api"):
                        offenders.append(f"{path}:{node.lineno}:{alias.name}")
    assert offenders == []


def test_full_model_dump_includes_nested_fields():
    from pydantic import BaseModel

    from commands._common import full_model_dump

    class Inner(BaseModel):
        value: int

    class Outer(BaseModel):
        name: str
        nested: Inner

    dumped = full_model_dump(Outer(name="x", nested=Inner(value=3)))
    assert dumped == {"name": "x", "nested": {"value": 3}}
    assert full_model_dump([{"a": Inner(value=1)}]) == [{"a": {"value": 1}}]
