"""
Shared provider environment variable configuration.

Single source of truth for provider→env-var mapping used by:
- ``construction_os.ai.key_provider`` (DB/env key provisioning)
- ``api.credentials_service`` (migrate-from-env, status checks)
"""

from typing import Any, Dict, TypedDict


class ProviderEnvSpec(TypedDict, total=False):
    """Per-provider env var specification."""

    env_var: str
    required: list[str]
    required_any: list[str]
    optional: list[str]


# Canonical provider env specs. ``env_var`` is the primary lookup key for simple
# providers in key_provider; credentials_service uses required/required_any/optional.
PROVIDER_ENV_SPECS: Dict[str, ProviderEnvSpec] = {
    "openai": {"env_var": "OPENAI_API_KEY", "required": ["OPENAI_API_KEY"]},
    "anthropic": {"env_var": "ANTHROPIC_API_KEY", "required": ["ANTHROPIC_API_KEY"]},
    "google": {
        "env_var": "GOOGLE_API_KEY",
        "required_any": ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    },
    "groq": {"env_var": "GROQ_API_KEY", "required": ["GROQ_API_KEY"]},
    "mistral": {"env_var": "MISTRAL_API_KEY", "required": ["MISTRAL_API_KEY"]},
    "deepseek": {"env_var": "DEEPSEEK_API_KEY", "required": ["DEEPSEEK_API_KEY"]},
    "xai": {"env_var": "XAI_API_KEY", "required": ["XAI_API_KEY"]},
    "openrouter": {"env_var": "OPENROUTER_API_KEY", "required": ["OPENROUTER_API_KEY"]},
    "voyage": {"env_var": "VOYAGE_API_KEY", "required": ["VOYAGE_API_KEY"]},
    "elevenlabs": {"env_var": "ELEVENLABS_API_KEY", "required": ["ELEVENLABS_API_KEY"]},
    "deepgram": {"env_var": "DEEPGRAM_API_KEY", "required": ["DEEPGRAM_API_KEY"]},
    "ollama": {"env_var": "OLLAMA_API_BASE", "required": ["OLLAMA_API_BASE"]},
    "vertex": {
        "required": ["VERTEX_PROJECT", "VERTEX_LOCATION"],
        "optional": ["GOOGLE_APPLICATION_CREDENTIALS"],
    },
    "azure": {
        "required": [
            "AZURE_OPENAI_API_KEY",
            "AZURE_OPENAI_ENDPOINT",
            "AZURE_OPENAI_API_VERSION",
        ],
        "optional": [
            "AZURE_OPENAI_ENDPOINT_LLM",
            "AZURE_OPENAI_ENDPOINT_EMBEDDING",
            "AZURE_OPENAI_ENDPOINT_STT",
            "AZURE_OPENAI_ENDPOINT_TTS",
        ],
    },
    "openai_compatible": {
        "required_any": ["OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_API_KEY"],
    },
    "dashscope": {"env_var": "DASHSCOPE_API_KEY", "required": ["DASHSCOPE_API_KEY"]},
    "minimax": {"env_var": "MINIMAX_API_KEY", "required": ["MINIMAX_API_KEY"]},
}


def _spec_without_env_var(spec: ProviderEnvSpec) -> dict[str, Any]:
    return {key: value for key, value in spec.items() if key != "env_var"}


# Simple provider map for key_provider (env_var lookup only).
PROVIDER_CONFIG: Dict[str, Dict[str, str]] = {
    provider: {"env_var": spec["env_var"]}
    for provider, spec in PROVIDER_ENV_SPECS.items()
    if "env_var" in spec
}

# Migration/status map for credentials_service (required/required_any/optional).
PROVIDER_ENV_CONFIG: Dict[str, dict] = {
    provider: _spec_without_env_var(spec) for provider, spec in PROVIDER_ENV_SPECS.items()
}
