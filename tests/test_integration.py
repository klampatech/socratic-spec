"""Integration tests for the orchestrator."""

import json
import subprocess
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

from socratic_spec.orchestrator import Orchestrator
from socratic_spec.session import SessionManager, SessionState
from socratic_spec.config import Config


class TestOrchestratorBasic:
    """Basic orchestrator integration tests."""

    @patch("socratic_spec.pi_client.PiClient")
    def test_orchestrator_initialization(self, mock_pi_client, tmp_path):
        """Orchestrator should initialize correctly."""
        config = Config(
            context=Path("context.md"),
            project_name="Test",
            output_dir=tmp_path
        )
        
        orchestrator = Orchestrator(config)
        
        assert orchestrator.config == config
        assert orchestrator.session is not None
        assert orchestrator.session.project_name == "Test"

    @patch("socratic_spec.pi_client.PiClient")
    def test_single_round_completes(self, mock_pi_client, tmp_path):
        """Single round of Q&A should complete."""
        # Mock pi client to return interrogator output with DONE
        mock_instance = Mock()
        mock_instance.run.return_value = """[SYNTHESIZED SPEC DRAFT]
# Test Project

## Outcome
Test completes.

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
DONE"""
        mock_pi_client.return_value = mock_instance
        
        context_file = tmp_path / "context.md"
        context_file.write_text("Test project description.")
        
        config = Config(
            context=context_file,
            project_name="Test",
            output_dir=tmp_path
        )
        
        orchestrator = Orchestrator(config)
        result = orchestrator.run()
        
        assert result.is_complete
        assert result.rounds_completed == 1

    @patch("socratic_spec.pi_client.PiClient")
    def test_multiple_rounds(self, mock_pi_client, tmp_path):
        """Multiple rounds of Q&A should work."""
        # Mock returns alternating responses
        mock_instance = Mock()
        responses = [
            # Round 1 - Interrogator asks question
            """[SYNTHESIZED SPEC DRAFT]
# Test

## Outcome
Test.

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
What is the scope?""",
            # Round 1 - Respondee answers
            "[ANSWER]\nThe scope includes X and Y.",
            # Round 2 - Interrogator asks follow-up
            """[SYNTHESIZED SPEC DRAFT]
# Test

## Outcome
Test.

## Scope
X and Y.

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
DONE""",
        ]
        mock_instance.run.side_effect = responses
        mock_pi_client.return_value = mock_instance
        
        context_file = tmp_path / "context.md"
        context_file.write_text("Test project.")
        
        config = Config(
            context=context_file,
            project_name="Test",
            output_dir=tmp_path,
            max_rounds=5
        )
        
        orchestrator = Orchestrator(config)
        result = orchestrator.run()
        
        assert result.rounds_completed >= 2


class TestOrchestratorSessionRecovery:
    """Tests for session recovery in orchestrator."""

    @patch("socratic_spec.pi_client.PiClient")
    def test_resume_session(self, mock_pi_client, tmp_path):
        """Resume should continue from existing session."""
        # Create initial session
        context_file = tmp_path / "context.md"
        context_file.write_text("Test project.")
        
        config1 = Config(
            context=context_file,
            project_name="Test",
            output_dir=tmp_path
        )
        
        orchestrator1 = Orchestrator(config1)
        # Create session without running
        
        # Get session ID
        session_id = orchestrator1.session.id
        
        # Resume with new orchestrator
        mock_instance = Mock()
        mock_instance.run.return_value = """[SYNTHESIZED SPEC DRAFT]
# Test

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
DONE"""
        mock_pi_client.return_value = mock_instance
        
        config2 = Config(
            context=context_file,
            project_name="Test",
            output_dir=tmp_path,
            resume_session_id=session_id
        )
        
        orchestrator2 = Orchestrator(config2)
        result = orchestrator2.run()
        
        assert orchestrator2.session.id == session_id

    @patch("socratic_spec.pi_client.PiClient")
    def test_resume_from_partial_round(self, mock_pi_client, tmp_path):
        """Resume from partial round should skip completed work."""
        # Create session with partial transcript
        context_file = tmp_path / "context.md"
        context_file.write_text("Test project.")
        
        config = Config(
            context=context_file,
            project_name="Test",
            output_dir=tmp_path
        )
        
        # Manually create session with partial transcript
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session(project_name="Test")
        session.start()
        
        # Add partial round (question only)
        session.append_transcript(round=1, type="question", content="First question?")
        
        # Resume
        mock_instance = Mock()
        mock_instance.run.return_value = """[SYNTHESIZED SPEC DRAFT]
# Test

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
DONE"""
        mock_pi_client.return_value = mock_instance
        
        config.resume_session_id = session.id
        orchestrator = Orchestrator(config)
        
        result = orchestrator.run()
        
        # Should skip the already-asked question
        # Interrogator should NOT be asked round 1 question again


class TestOrchestratorMaxRounds:
    """Tests for max rounds enforcement."""

    @patch("socratic_spec.pi_client.PiClient")
    def test_max_rounds_respected(self, mock_pi_client, tmp_path):
        """Should stop at max rounds even without DONE."""
        # Mock always returns a question (never DONE)
        mock_instance = Mock()
        mock_instance.run.return_value = """[SYNTHESIZED SPEC DRAFT]
# Test

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
Still have questions?"""
        mock_pi_client.return_value = mock_instance
        
        context_file = tmp_path / "context.md"
        context_file.write_text("Test project.")
        
        config = Config(
            context=context_file,
            project_name="Test",
            output_dir=tmp_path,
            max_rounds=3
        )
        
        orchestrator = Orchestrator(config)
        result = orchestrator.run()
        
        # Should have completed exactly max rounds
        assert result.rounds_completed == 3