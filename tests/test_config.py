"""Tests for configuration loading."""

import tempfile
from pathlib import Path

import pytest

# Python 3.11+ has tomllib in stdlib
try:
    import tomllib
except ImportError:
    import tomli as tomllib

from socratic_spec.config import (
    Config,
    ConfigSource,
    merge_configs,
    load_config_from_file,
    get_default_config_path,
)


class TestConfigDefaults:
    """Tests for default configuration values."""

    def test_default_values_are_sensible(self):
        """Verify all defaults are sensible for CLI tool."""
        config = Config()
        
        assert config.max_rounds == 50
        assert config.output_dir == Path("sessions")
        assert config.project_name == "project"
        assert config.model is None
        assert config.interrogator_model is None
        assert config.respondee_model is None
        assert config.template_dir is None
        assert config.log_level == "INFO"
        assert config.log_json is False

    def test_default_config_is_valid(self):
        """Config should be valid with no overrides."""
        config = Config()
        # Should not raise any validation errors
        assert config.context is None  # Required arg, None until set
        assert config.resume_session_id is None


class TestConfigFromFile:
    """Tests for loading configuration from TOML file."""

    def test_load_minimal_config(self, tmp_path):
        """Load a config file with minimal settings."""
        config_file = tmp_path / "config.toml"
        config_file.write_text("""
[settings]
max_rounds = 25
output_dir = "./my-sessions"
""")
        
        settings = load_config_from_file(config_file)
        
        assert settings["max_rounds"] == 25
        assert settings["output_dir"] == "./my-sessions"

    def test_load_full_config(self, tmp_path):
        """Load a config file with all settings."""
        config_file = tmp_path / "config.toml"
        config_file.write_text("""
[settings]
max_rounds = 100
output_dir = "./specs"
project_name = "MyApp"
model = "anthropic:claude-sonnet-4"
interrogator_model = "anthropic:claude-opus-3"
respondee_model = "anthropic:claude-haiku"
template_dir = "./custom-templates"
log_level = "DEBUG"
log_json = true
""")
        
        settings = load_config_from_file(config_file)
        
        assert settings["max_rounds"] == 100
        assert settings["output_dir"] == "./specs"
        assert settings["project_name"] == "MyApp"
        assert settings["model"] == "anthropic:claude-sonnet-4"
        assert settings["interrogator_model"] == "anthropic:claude-opus-3"
        assert settings["respondee_model"] == "anthropic:claude-haiku"
        assert settings["template_dir"] == "./custom-templates"
        assert settings["log_level"] == "DEBUG"
        assert settings["log_json"] is True

    def test_missing_config_file_raises(self):
        """Loading non-existent config should raise FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            load_config_from_file(Path("/nonexistent/config.toml"))

    def test_invalid_toml_raises(self, tmp_path):
        """Invalid TOML syntax should raise proper error."""
        config_file = tmp_path / "invalid.toml"
        config_file.write_text("""
[settings
max_rounds = "not a number"
""")
        
        with pytest.raises(Exception):  # TOMLDecodeError or similar
            load_config_from_file(config_file)


class TestDefaultConfigPath:
    """Tests for default config path location."""

    def test_default_path_is_correct_location(self):
        """Default config should be at ~/.config/socratic_spec.toml."""
        default_path = get_default_config_path()
        
        assert default_path.name == "socratic_spec.toml"
        assert ".config" in str(default_path)

    def test_default_path_expands_user(self):
        """Path with ~ should expand to user home."""
        path = get_default_config_path()
        
        assert "~" not in str(path)
        assert path.expanduser() == path


class TestMergeConfigs:
    """Tests for merging config sources (file + CLI args)."""

    def test_file_config_base(self):
        """File config should be the base."""
        file_settings = {"max_rounds": 30}
        
        merged = merge_configs(file_settings, {})
        
        assert merged.max_rounds == 30

    def test_cli_args_override_file(self):
        """CLI arguments should override file settings."""
        file_settings = {"max_rounds": 30, "output_dir": "./file-dir"}
        cli_overrides = {"max_rounds": 50}
        
        merged = merge_configs(file_settings, cli_overrides)
        
        assert merged.max_rounds == 50
        assert merged.output_dir == Path("./file-dir")

    def test_cli_none_does_not_override(self):
        """CLI None values should not override file values."""
        file_settings = {"max_rounds": 30}
        cli_overrides = {"max_rounds": None}  # Explicitly set to None
        
        merged = merge_configs(file_settings, cli_overrides)
        
        # None in CLI should NOT override the file value
        assert merged.max_rounds == 30

    def test_all_cli_overrides(self):
        """All settings can come from CLI."""
        cli_overrides = {
            "max_rounds": 100,
            "output_dir": "./cli-dir",
            "project_name": "CLIProject",
            "context": Path("./context.md"),
            "log_level": "DEBUG",
        }
        
        merged = merge_configs({}, cli_overrides)
        
        assert merged.max_rounds == 100
        assert merged.output_dir == Path("./cli-dir")
        assert merged.project_name == "CLIProject"
        assert merged.context == Path("./context.md")
        assert merged.log_level == "DEBUG"


class TestConfigValidation:
    """Tests for config validation."""

    def test_max_rounds_must_be_positive(self):
        """max_rounds must be a positive integer."""
        with pytest.raises(ValueError, match="max_rounds.*positive"):
            Config(max_rounds=0)
        
        with pytest.raises(ValueError, match="max_rounds.*positive"):
            Config(max_rounds=-1)

    def test_max_rounds_max_value(self):
        """max_rounds should have a reasonable upper bound."""
        with pytest.raises(ValueError, match="max_rounds.*too large"):
            Config(max_rounds=10000)

    def test_invalid_log_level(self):
        """Invalid log level should raise."""
        with pytest.raises(ValueError, match="log_level.*invalid"):
            Config(log_level="SUPER_VERBOSE")

    def test_output_dir_must_be_valid(self):
        """output_dir must be a valid path."""
        with pytest.raises(ValueError, match="output_dir.*invalid"):
            Config(output_dir=Path("/nonexistent/path/that/cant/be/created"))

    def test_context_must_exist_if_set(self):
        """context file must exist if provided."""
        with pytest.raises(FileNotFoundError):
            Config(context=Path("/nonexistent/context.md"))


class TestConfigEquality:
    """Tests for config comparison."""

    def test_equal_configs_are_equal(self):
        """Two configs with same values should be equal."""
        config1 = Config(max_rounds=50, project_name="Test")
        config2 = Config(max_rounds=50, project_name="Test")
        
        assert config1 == config2

    def test_different_configs_are_not_equal(self):
        """Configs with different values should not be equal."""
        config1 = Config(max_rounds=50)
        config2 = Config(max_rounds=100)
        
        assert config1 != config2


# Fixtures

@pytest.fixture
def tmp_config_file(tmp_path):
    """Create a temporary config file."""
    config_file = tmp_path / "test_config.toml"
    config_file.write_text("""
[settings]
max_rounds = 25
project_name = "TestProject"
log_level = "DEBUG"
""")
    return config_file
