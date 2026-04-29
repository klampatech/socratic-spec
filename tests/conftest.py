"""Pytest configuration and shared fixtures."""

import os
import sys
from pathlib import Path

import pytest


# Add src to path for imports
@pytest.fixture(scope="session", autouse=True)
def setup_path():
    """Add src to Python path."""
    src_path = Path(__file__).parent.parent / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))


@pytest.fixture
def temp_context_file(tmp_path):
    """Create a temporary context file."""
    context_file = tmp_path / "context.md"
    context_file.write_text("""# Test Project Context

This is a test project for validating the spec refiner.

## High-Level Requirements
- Users can authenticate
- Data is stored in a database
- API endpoints are RESTful
""")
    return context_file


@pytest.fixture
def sample_transcript():
    """Sample transcript data for testing."""
    return """{"round": 1, "type": "question", "content": "What is the main goal?", "timestamp": "2026-04-28T10:00:00Z"}
{"round": 1, "type": "answer", "content": "The main goal is to build a web app.", "timestamp": "2026-04-28T10:01:00Z"}
{"round": 2, "type": "question", "content": "Who are the users?", "timestamp": "2026-04-28T10:02:00Z"}
{"round": 2, "type": "answer", "content": "The users are developers and end-users.", "timestamp": "2026-04-28T10:03:00Z"}
"""


@pytest.fixture
def sample_spec_draft():
    """Sample spec draft for testing."""
    return """# Test Project Specification

## Outcome
A web application that serves user authentication.

## Given Preconditions
- User has valid credentials
- System is operational

## When Trigger
User submits login form.

## Then Expectations
- Credentials are validated
- Session is created
- User is redirected to dashboard

## Failure Modes
- F1: Invalid credentials → show error message
- F2: Account locked → show lockout message
"""


@pytest.fixture
def mock_pi_response():
    """Mock pi CLI response."""
    def _make_response(output_text: str) -> str:
        """Create a mock pi JSONL response."""
        return f'{{"type": "session", "version": "1.0"}}\n{{"type": "agent_end", "messages": [{{"type": "text", "content": [{{"type": "text", "text": {output_text}}}]}}]}}\n'
    return _make_response


@pytest.fixture(autouse=True)
def clean_environment():
    """Clean environment variables before each test."""
    # Store original env
    original_env = os.environ.copy()
    
    yield
    
    # Restore original env
    os.environ.clear()
    os.environ.update(original_env)


@pytest.fixture
def home_with_config(tmp_path, monkeypatch):
    """Create a fake home directory with config."""
    fake_home = tmp_path / "fake_home"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    return fake_home
