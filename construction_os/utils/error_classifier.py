"""
Error classification utility for LLM provider errors.

Maps raw exceptions from AI providers/Esperanto/LangChain to user-friendly
error messages and appropriate exception types.
"""

from loguru import logger

from construction_os.exceptions import (
    AuthenticationError,
    ConfigurationError,
    ExternalServiceError,
    NetworkError,
    ConstructionOSError,
    RateLimitError,
)

QUOTA_BILLING_MESSAGE = (
    "AI provider quota or billing limit reached. "
    "Check your provider plan and billing, then try again."
)
RATE_LIMIT_MESSAGE = "Rate limit exceeded. Please wait a moment and try again."

# Classification rules: (keywords, exception_class, user_message or None to pass through)
# Quota/billing must come before rate-limit so insufficient_quota 429s are not mislabeled.
_CLASSIFICATION_RULES: list[tuple[list[str], type[ConstructionOSError], str | None]] = [
    # Authentication errors
    (
        ["authentication", "unauthorized", "invalid api key", "invalid_api_key", "401"],
        AuthenticationError,
        "Authentication failed. Please check your API key in Settings -> Credentials.",
    ),
    # Quota / billing (providers often return HTTP 429 with these phrases)
    (
        [
            "insufficient_quota",
            "quota exceeded",
            "exceeded your current quota",
            "check your plan and billing",
            "billing details",
        ],
        ExternalServiceError,
        QUOTA_BILLING_MESSAGE,
    ),
    # Temporary rate / request throttle
    (
        ["rate limit", "rate_limit", "429", "too many requests"],
        RateLimitError,
        RATE_LIMIT_MESSAGE,
    ),
    # Model not found (pass through original message)
    (
        ["model not found", "does not exist", "model_not_found"],
        ConfigurationError,
        None,
    ),
    # Configuration errors from provision.py (pass through)
    (
        ["no model configured", "please go to settings"],
        ConfigurationError,
        None,
    ),
    # Network errors
    (
        ["connecterror", "timeoutexception", "connection refused", "connection error", "timed out", "timeout"],
        NetworkError,
        "Could not connect to the AI provider. Please check your network connection and provider URL.",
    ),
    # Context length errors
    (
        ["context length", "token limit", "maximum context", "context_length_exceeded", "max_tokens"],
        ExternalServiceError,
        "Content too large for the selected model. Try using a smaller selection or a model with a larger context window.",
    ),
    # Payload too large errors
    (
        ["413", "payload too large", "request entity too large"],
        ExternalServiceError,
        "The request payload is too large for the AI provider. Try reducing the content size or using a different model.",
    ),
    # Provider availability errors
    (
        ["500", "502", "503", "service unavailable", "overloaded", "internal server error"],
        ExternalServiceError,
        "The AI provider is temporarily unavailable. Please try again in a few minutes.",
    ),
]


def classify_error(exception: BaseException) -> tuple[type[ConstructionOSError], str]:
    """
    Classify a raw exception into a user-friendly error type and message.

    Args:
        exception: Any exception from LLM providers/Esperanto/LangChain

    Returns:
        Tuple of (exception_class, user_friendly_message)
    """
    # Already-typed app errors: keep the message as-is (avoid double-classification).
    if isinstance(exception, ConstructionOSError):
        return type(exception), str(exception)

    error_str = str(exception).lower()
    error_type_name = type(exception).__name__.lower()
    combined = f"{error_type_name}: {error_str}"

    for keywords, exc_class, message in _CLASSIFICATION_RULES:
        for keyword in keywords:
            if keyword in combined:
                user_message = message if message is not None else _truncate(str(exception))
                return exc_class, user_message

    # Unclassified error - log for future improvement
    logger.warning(
        f"Unclassified LLM error ({type(exception).__name__}): {exception}"
    )
    return ExternalServiceError, f"AI service error: {_truncate(str(exception))}"


def _truncate(text: str, max_length: int = 200) -> str:
    """Truncate text to max_length to avoid leaking verbose internal details."""
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."
