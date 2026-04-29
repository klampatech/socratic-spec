"""Structured logging configuration for Socratic Spec."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from socratic_spec.config import Config


class JsonFormatter(logging.Formatter):
    """JSON formatter for structured logging."""

    def __init__(self, include_extra: bool = True):
        super().__init__()
        self.include_extra = include_extra

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Add extra fields
        if self.include_extra:
            extra_fields = {
                k: v for k, v in record.__dict__.items()
                if k not in logging.LogRecord(
                    "", 0, "", 0, "", (), None
                ).__dict__ and not k.startswith("_")
            }
            if extra_fields:
                log_entry["extra"] = extra_fields

        return json.dumps(log_entry)


class ColoredFormatter(logging.Formatter):
    """Colored formatter for console output."""

    # ANSI color codes
    COLORS = {
        "DEBUG": "\033[36m",      # Cyan
        "INFO": "\033[32m",       # Green
        "WARNING": "\033[33m",    # Yellow
        "ERROR": "\033[31m",      # Red
        "CRITICAL": "\033[35m",   # Magenta
    }
    RESET = "\033[0m"

    def __init__(self, fmt: str | None = None, datefmt: str | None = None):
        super().__init__(fmt, datefmt)

    def format(self, record: logging.LogRecord) -> str:
        """Format log record with colors."""
        color = self.COLORS.get(record.levelname, "")
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def setup_logging(
    config: Config,
    session_id: str | None = None,
    log_file: Path | None = None
) -> logging.Logger:
    """Set up logging based on configuration.
    
    Args:
        config: Configuration object
        session_id: Optional session ID for context
        log_file: Optional file path for file logging
        
    Returns:
        Configured logger instance
    """
    # Create logger
    logger = logging.getLogger("socratic_spec")
    logger.setLevel(getattr(logging, config.log_level.upper()))
    
    # Clear any existing handlers
    logger.handlers.clear()

    # Create formatter based on config
    if config.log_json:
        formatter = JsonFormatter()
    else:
        fmt = "%(asctime)s | %(levelname)-8s | %(message)s"
        datefmt = "%Y-%m-%d %H:%M:%S"
        formatter = ColoredFormatter(fmt, datefmt)

    # Console handler
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler (if specified)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.DEBUG)
        # Always use JSON for file logging
        file_handler.setFormatter(JsonFormatter())
        logger.addHandler(file_handler)

    # Add session context if provided
    if session_id:
        old_factory = logging.getLogRecordFactory()

        def session_record_factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
            record = old_factory(*args, **kwargs)
            record.session_id = session_id
            return record

        logging.setLogRecordFactory(session_record_factory)

    return logger


def get_logger(name: str | None = None) -> logging.Logger:
    """Get a logger instance.
    
    Args:
        name: Optional logger name (defaults to socratic_spec)
        
    Returns:
        Logger instance
    """
    if name:
        return logging.getLogger(f"socratic_spec.{name}")
    return logging.getLogger("socratic_spec")
