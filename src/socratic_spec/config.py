"""Configuration management for Socratic Spec."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

# Python 3.11+ has tomllib in stdlib
if sys.version_info >= (3, 11):
    import tomllib
else:
    try:
        import tomli as tomllib
    except ImportError:
        tomllib = None  # type: ignore


class ConfigSource(Enum):
    """Source of configuration value."""

    DEFAULT = "default"
    CONFIG_FILE = "config_file"
    CLI_ARG = "cli_arg"


# Valid log levels
VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}

# Constants
DEFAULT_MAX_ROUNDS = 50
DEFAULT_OUTPUT_DIR = Path("sessions")
DEFAULT_PROJECT_NAME = "project"
DEFAULT_LOG_LEVEL = "INFO"
DEFAULT_LOG_JSON = False
MAX_ROUNDS_MIN = 1
MAX_ROUNDS_MAX = 1000


@dataclass
class Config:
    """Configuration for Socratic Spec.
    
    Attributes:
        context: Path to context file (required CLI argument)
        resume_session_id: Session ID to resume (optional)
        max_rounds: Maximum number of Q&A rounds (default: 50)
        output_dir: Directory for session output (default: sessions/)
        project_name: Name for the project (default: project)
        model: Model override for both agents (optional)
        interrogator_model: Model for Interrogator agent (optional)
        respondee_model: Model for Respondee agent (optional)
        template_dir: Directory for custom templates (optional)
        log_level: Logging level (default: INFO)
        log_json: Use JSON logging format (default: False)
    """

    # Required CLI argument
    context: Path | None = None

    # Session recovery
    resume_session_id: str | None = None

    # General settings
    max_rounds: int = DEFAULT_MAX_ROUNDS
    output_dir: Path = field(default_factory=lambda: DEFAULT_OUTPUT_DIR)
    project_name: str = DEFAULT_PROJECT_NAME

    # Model overrides
    model: str | None = None
    interrogator_model: str | None = None
    respondee_model: str | None = None

    # Template settings
    template_dir: Path | None = None

    # Logging settings
    log_level: str = DEFAULT_LOG_LEVEL
    log_json: bool = DEFAULT_LOG_JSON

    def __post_init__(self) -> None:
        """Validate configuration after initialization."""
        self._validate()

    def _validate(self) -> None:
        """Validate all configuration values."""
        # Validate max_rounds
        if not isinstance(self.max_rounds, int):
            raise ValueError(f"max_rounds must be an integer, got {type(self.max_rounds).__name__}")
        if self.max_rounds < MAX_ROUNDS_MIN:
            raise ValueError(f"max_rounds must be >= {MAX_ROUNDS_MIN}, got {self.max_rounds}")
        if self.max_rounds > MAX_ROUNDS_MAX:
            raise ValueError(f"max_rounds must be <= {MAX_ROUNDS_MAX}, got {self.max_rounds}")

        # Validate log_level
        if self.log_level not in VALID_LOG_LEVELS:
            raise ValueError(
                f"log_level must be one of {VALID_LOG_LEVELS}, got '{self.log_level}'"
            )

        # Validate output_dir can be converted to Path
        if self.output_dir is not None:
            Path(self.output_dir)  # Will raise if invalid

        # Note: context file validation is done at runtime, not here
        # This allows Config to be created without a context for validation purposes

        # Validate template_dir if set
        if self.template_dir is not None:
            template_path = Path(self.template_dir)
            if not template_path.exists():
                raise FileNotFoundError(f"Template directory not found: {template_path}")
            if not template_path.is_dir():
                raise NotADirectoryError(f"Template path is not a directory: {template_path}")

        # Validate model strings are not empty
        for model_attr in ["model", "interrogator_model", "respondee_model"]:
            value = getattr(self, model_attr)
            if value is not None and not value.strip():
                raise ValueError(f"{model_attr} cannot be empty string")

    def get_interrogator_model(self) -> str | None:
        """Get effective model for Interrogator."""
        return self.interrogator_model or self.model

    def get_respondee_model(self) -> str | None:
        """Get effective model for Respondee."""
        return self.respondee_model or self.model


def get_default_config_path() -> Path:
    """Get the default config file path.
    
    Returns:
        Path to ~/.config/socratic_spec.toml
    """
    home = Path.home()
    return home / ".config" / "socratic_spec.toml"


def load_config_from_file(config_path: Path) -> dict[str, Any]:
    """Load configuration from a TOML file.
    
    Args:
        config_path: Path to the config file
        
    Returns:
        Dictionary of settings from the config file
        
    Raises:
        FileNotFoundError: If config file doesn't exist
        tomli.TOMLDecodeError: If TOML is invalid
    """
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, "rb") as f:
        config_data = tomllib.load(f)

    # Extract settings section
    settings = config_data.get("settings", {})
    return settings


def merge_configs(
    file_settings: dict[str, Any],
    cli_overrides: dict[str, Any]
) -> Config:
    """Merge file settings with CLI overrides.
    
    CLI overrides take precedence over file settings.
    None values in CLI overrides are ignored (file value is used).
    
    Args:
        file_settings: Settings loaded from config file
        cli_overrides: Settings from CLI arguments
        
    Returns:
        Merged Config object
    """
    # Start with file settings
    merged: dict[str, Any] = dict(file_settings)

    # Apply CLI overrides (skip None values)
    for key, value in cli_overrides.items():
        if value is not None:
            merged[key] = value

    # Convert Path-like strings to Path objects
    path_fields = ["output_dir", "template_dir", "context"]
    for field in path_fields:
        if field in merged and merged[field] is not None:
            merged[field] = Path(merged[field])

    # Create Config with merged values
    return Config(**merged)


def load_config(
    cli_args: dict[str, Any],
    config_file: Path | None = None
) -> Config:
    """Load and merge configuration from all sources.
    
    Priority (highest to lowest):
    1. CLI arguments
    2. Config file
    3. Defaults
    
    Args:
        cli_args: CLI argument values
        config_file: Path to config file (default: ~/.config/socratic_spec.toml)
        
    Returns:
        Merged Config object
    """
    # Try to load from config file
    file_settings: dict[str, Any] = {}
    if config_file is None:
        config_file = get_default_config_path()
    
    if config_file.exists():
        try:
            file_settings = load_config_from_file(config_file)
        except Exception:
            # Ignore config file errors, use defaults
            pass

    # Merge with CLI args
    return merge_configs(file_settings, cli_args)
