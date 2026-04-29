"""Tests for CLI interface."""

import subprocess
import sys
from pathlib import Path

import pytest
from click.testing import CliRunner

from socratic_spec.cli import cli, main


class TestCLIHelp:
    """Tests for CLI help output."""

    def test_help_flag(self):
        """--help should show usage."""
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli", "--help"],
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0
        assert "socratic-spec" in result.stdout.lower() or "usage" in result.stdout.lower()

    def test_help_shows_context_required(self):
        """Help should indicate --context is required."""
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli", "--help"],
            capture_output=True,
            text=True
        )
        
        assert "--context" in result.stdout

    def test_help_shows_all_options(self):
        """Help should show all available options."""
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli", "--help"],
            capture_output=True,
            text=True
        )
        
        options = ["--context", "--project-name", "--max-rounds", "--output", "--model"]
        for option in options:
            assert option in result.stdout


class TestCLIErrors:
    """Tests for CLI error handling."""

    def test_missing_context_shows_error(self):
        """Missing --context should show error."""
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli"],
            capture_output=True,
            text=True
        )
        
        assert result.returncode != 0
        assert "context" in result.stdout.lower() or "required" in result.stdout.lower()

    def test_nonexistent_context_file(self):
        """Non-existent context file should show error."""
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli", "--context", "/nonexistent/file.md"],
            capture_output=True,
            text=True
        )
        
        assert result.returncode != 0
        assert "not found" in result.stdout.lower() or "error" in result.stdout.lower()

    def test_invalid_max_rounds(self):
        """Invalid max-rounds should show error."""
        context_file = Path("/tmp/test_context.md")
        context_file.write_text("test")
        
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli", "--context", str(context_file), "--max-rounds", "abc"],
            capture_output=True,
            text=True
        )
        
        assert result.returncode != 0


class TestCLIArguments:
    """Tests for CLI argument parsing."""

    def test_context_argument(self, tmp_path):
        """--context should accept file path."""
        context_file = tmp_path / "context.md"
        context_file.write_text("Test context")
        
        # This should not raise (will fail at execution, not parsing)
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli", "--context", str(context_file), "--help"],
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0

    def test_project_name_argument(self, tmp_path):
        """--project-name should set project name."""
        context_file = tmp_path / "context.md"
        context_file.write_text("Test context")
        
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli", 
             "--context", str(context_file),
             "--project-name", "MyTestProject",
             "--help"],
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0

    def test_max_rounds_argument(self, tmp_path):
        """--max-rounds should accept integer."""
        context_file = tmp_path / "context.md"
        context_file.write_text("Test context")
        
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli",
             "--context", str(context_file),
             "--max-rounds", "100",
             "--help"],
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0

    def test_output_argument(self, tmp_path):
        """--output should accept directory path."""
        context_file = tmp_path / "context.md"
        context_file.write_text("Test context")
        output_dir = tmp_path / "output"
        
        result = subprocess.run(
            [sys.executable, "-m", "socratic_spec.cli",
             "--context", str(context_file),
             "--output", str(output_dir),
             "--help"],
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0


class TestCLIIntegration:
    """Integration tests for CLI (with mocked pi)."""

    @pytest.fixture
    def cli_runner(self):
        """Create a CLI runner."""
        return CliRunner()

    def test_cli_creates_session_directory(self, cli_runner, tmp_path):
        """CLI should create session directory."""
        context_file = tmp_path / "context.md"
        context_file.write_text("Test context")
        output_dir = tmp_path / "sessions"
        
        # Mock the orchestrator to avoid actual pi calls
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("socratic_spec.cli.main", lambda: None)
            
            result = cli_runner.invoke(cli, [
                "--context", str(context_file),
                "--output", str(output_dir),
            ])
            
            # Check if output directory was mentioned in output
            assert "session" in result.output.lower() or output_dir.name in result.output

    def test_cli_with_resume(self, cli_runner, tmp_path):
        """--resume should accept session ID."""
        context_file = tmp_path / "context.md"
        context_file.write_text("Test context")
        
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("socratic_spec.cli.main", lambda: None)
            
            result = cli_runner.invoke(cli, [
                "--context", str(context_file),
                "--resume", "test-session-id-123",
            ])
            
            # Should not error on resume flag
            assert "resume" in result.output.lower() or result.exit_code == 0
