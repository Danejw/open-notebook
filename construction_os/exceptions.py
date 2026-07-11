class ConstructionOSError(Exception):
    """Base exception class for Construction OS errors."""

    pass


class DatabaseOperationError(ConstructionOSError):
    """Raised when a database operation fails."""

    pass


class UnsupportedTypeException(ConstructionOSError):
    """Raised when an unsupported type is provided."""

    pass


class InvalidInputError(ConstructionOSError):
    """Raised when invalid input is provided."""

    pass


class NotFoundError(ConstructionOSError):
    """Raised when a requested resource is not found."""

    pass


class AuthenticationError(ConstructionOSError):
    """Raised when there's an authentication problem."""

    pass


class ConfigurationError(ConstructionOSError):
    """Raised when there's a configuration problem."""

    pass


class ExternalServiceError(ConstructionOSError):
    """Raised when an external service (e.g., AI model) fails."""

    pass


class RateLimitError(ConstructionOSError):
    """Raised when a rate limit is exceeded."""

    pass


class FileOperationError(ConstructionOSError):
    """Raised when a file operation fails."""

    pass


class NetworkError(ConstructionOSError):
    """Raised when a network operation fails."""

    pass


class NoTranscriptFound(ConstructionOSError):
    """Raised when no transcript is found for a video."""

    pass
