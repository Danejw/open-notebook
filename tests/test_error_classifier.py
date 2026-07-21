"""Unit tests for LLM provider error classification."""

from construction_os.exceptions import ExternalServiceError, RateLimitError
from construction_os.utils.error_classifier import (
    QUOTA_BILLING_MESSAGE,
    RATE_LIMIT_MESSAGE,
    classify_error,
)


class TestQuotaVersusRateLimit:
    def test_insufficient_quota_is_billing_not_rate_limit(self) -> None:
        exc = Exception(
            "Error code: 429 - {'error': {'message': 'You exceeded your current "
            "quota, please check your plan and billing details.', "
            "'type': 'insufficient_quota', 'code': 'insufficient_quota'}}"
        )
        exc_class, message = classify_error(exc)
        assert exc_class is ExternalServiceError
        assert message == QUOTA_BILLING_MESSAGE

    def test_google_quota_exceeded_is_billing(self) -> None:
        exc = Exception(
            "Google API error: You exceeded your current quota, please check your "
            "plan and billing details. For more information on this error, head to: "
            "https://ai.google.dev/gemini-api/docs/rate-limits."
        )
        exc_class, message = classify_error(exc)
        assert exc_class is ExternalServiceError
        assert message == QUOTA_BILLING_MESSAGE

    def test_temporary_rate_limit_without_quota_phrases(self) -> None:
        exc = Exception("Error code: 429 - Rate limit reached for requests")
        exc_class, message = classify_error(exc)
        assert exc_class is RateLimitError
        assert message == RATE_LIMIT_MESSAGE

    def test_too_many_requests(self) -> None:
        exc = Exception("Too Many Requests")
        exc_class, message = classify_error(exc)
        assert exc_class is RateLimitError
        assert message == RATE_LIMIT_MESSAGE


class TestPassThrough:
    def test_already_raised_rate_limit_keeps_message(self) -> None:
        original = "Custom rate limit message from graph"
        exc = RateLimitError(original)
        exc_class, message = classify_error(exc)
        assert exc_class is RateLimitError
        assert message == original

    def test_already_raised_external_service_keeps_message(self) -> None:
        original = "Custom provider unavailable message"
        exc = ExternalServiceError(original)
        exc_class, message = classify_error(exc)
        assert exc_class is ExternalServiceError
        assert message == original

    def test_pass_through_does_not_rewrite_quota_message(self) -> None:
        exc = ExternalServiceError(QUOTA_BILLING_MESSAGE)
        exc_class, message = classify_error(exc)
        assert exc_class is ExternalServiceError
        assert message == QUOTA_BILLING_MESSAGE
