"""Custom exceptions for Socratic Spec."""


class SocraticSpecError(Exception):
    """Base exception for all Socratic Spec errors."""

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def __str__(self) -> str:
        if self.details:
            details_str = ", ".join(f"{k}={v}" for k, v in self.details.items())
            return f"{self.message} ({details_str})"
        return self.message


class ParseError(SocraticSpecError):
    """Raised when parsing fails."""

    def __init__(self, message: str, source: str | None = None, line: int | None = None):
        details = {}
        if source:
            details["source"] = source
        if line is not None:
            details["line"] = line
        super().__init__(message, details)


class PiCliError(SocraticSpecError):
    """Raised when pi CLI operations fail."""

    def __init__(self, message: str, return_code: int | None = None, stderr: str | None = None):
        details = {}
        if return_code is not None:
            details["return_code"] = return_code
        if stderr:
            details["stderr"] = stderr[:200]  # Truncate for display
        super().__init__(message, details)
        self.return_code = return_code
        self.stderr = stderr


class SessionNotFoundError(SocraticSpecError):
    """Raised when a session cannot be found."""

    def __init__(self, session_id: str):
        super().__init__(f"Session not found: {session_id}", {"session_id": session_id})
        self.session_id = session_id


class SessionCorruptedError(SocraticSpecError):
    """Raised when session data is corrupted."""

    def __init__(self, session_id: str, reason: str):
        super().__init__(
            f"Session corrupted: {reason}",
            {"session_id": session_id, "reason": reason}
        )
        self.session_id = session_id
        self.reason = reason


class TimeoutError(SocraticSpecError):
    """Raised when an operation times out."""

    def __init__(self, operation: str, timeout_seconds: int):
        super().__init__(
            f"Operation timed out: {operation} (timeout={timeout_seconds}s)",
            {"operation": operation, "timeout_seconds": timeout_seconds}
        )
        self.operation = operation
        self.timeout_seconds = timeout_seconds


class ValidationError(SocraticSpecError):
    """Raised when validation fails."""

    def __init__(self, message: str, field: str | None = None, value: any = None):
        details = {}
        if field:
            details["field"] = field
        if value is not None:
            details["value"] = repr(value)[:50]  # Truncate for display
        super().__init__(message, details)


class TemplateError(SocraticSpecError):
    """Raised when template loading or processing fails."""

    def __init__(self, message: str, template_path: str | None = None):
        details = {}
        if template_path:
            details["template_path"] = template_path
        super().__init__(message, details)
