"""Import smoke tests for langchain-* provider packages (RED-016).

Esperanto loads these packages dynamically when ``Model.to_langchain()`` is
called for a configured provider. App code imports ``langchain_core`` and
Esperanto only; direct provider imports are absent by design.

Do **not** remove a package from ``pyproject.toml`` without:
1. A passing live ``to_langchain()`` smoke for that provider, and
2. Updating the matrix below.

| PyPI package            | Import module           | Status (2026-07-15) |
| ----------------------- | ----------------------- | ------------------- |
| langchain               | langchain               | required (base)     |
| langchain-community     | langchain_community     | required            |
| langchain-openai        | langchain_openai        | required            |
| langchain-anthropic     | langchain_anthropic     | required            |
| langchain-ollama        | langchain_ollama        | required            |
| langchain-google-genai  | langchain_google_genai  | required            |
| langchain-groq          | langchain_groq          | required            |
| langchain_mistralai     | langchain_mistralai     | required            |
| langchain_deepseek      | langchain_deepseek      | required            |
"""

from __future__ import annotations

import importlib

import pytest

LANGCHAIN_PROVIDER_PACKAGES: list[tuple[str, str]] = [
    ("langchain", "langchain"),
    ("langchain-community", "langchain_community"),
    ("langchain-openai", "langchain_openai"),
    ("langchain-anthropic", "langchain_anthropic"),
    ("langchain-ollama", "langchain_ollama"),
    ("langchain-google-genai", "langchain_google_genai"),
    ("langchain-groq", "langchain_groq"),
    ("langchain_mistralai", "langchain_mistralai"),
    ("langchain_deepseek", "langchain_deepseek"),
]


@pytest.mark.parametrize(("pypi_name", "import_name"), LANGCHAIN_PROVIDER_PACKAGES)
def test_langchain_provider_package_importable(pypi_name: str, import_name: str) -> None:
    """Each declared langchain-* dependency must import successfully."""
    module = importlib.import_module(import_name)
    assert module is not None, f"{pypi_name} ({import_name}) failed to import"
