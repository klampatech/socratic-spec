"""Socratic Spec - A Two-Agent Specification Refinement Tool."""

__version__ = "0.1.0"
__author__ = "Kyle Lampa"
__email__ = "kyle@example.com"

from socratic_spec.config import Config
from socratic_spec.exceptions import (
    SocraticSpecError,
    ParseError,
    PiCliError,
    SessionNotFoundError,
    SessionCorruptedError,
    TimeoutError,
)

__all__ = [
    "__version__",
    "Config",
    "SocraticSpecError",
    "ParseError",
    "PiCliError",
    "SessionNotFoundError",
    "SessionCorruptedError",
    "TimeoutError",
]
