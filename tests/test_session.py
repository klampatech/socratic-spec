"""Tests for session management."""

import json
from datetime import datetime
from pathlib import Path

import pytest

from socratic_spec.session import (
    Session,
    SessionManager,
    SessionState,
    SessionNotFoundError,
    SessionCorruptedError,
)


class TestSessionState:
    """Tests for SessionState enum."""

    def test_all_states_exist(self):
        """All expected states should exist."""
        assert SessionState.PENDING.value == "pending"
        assert SessionState.ACTIVE.value == "active"
        assert SessionState.COMPLETED.value == "completed"
        assert SessionState.FAILED.value == "failed"

    def test_state_transitions_valid(self):
        """Valid state transitions should be allowed."""
        # PENDING -> ACTIVE is valid
        assert SessionState.PENDING.can_transition_to(SessionState.ACTIVE)
        # ACTIVE -> COMPLETED is valid
        assert SessionState.ACTIVE.can_transition_to(SessionState.COMPLETED)
        # ACTIVE -> FAILED is valid
        assert SessionState.ACTIVE.can_transition_to(SessionState.FAILED)

    def test_state_transitions_invalid(self):
        """Invalid state transitions should be blocked."""
        # PENDING -> COMPLETED is NOT valid (must go through ACTIVE)
        assert not SessionState.PENDING.can_transition_to(SessionState.COMPLETED)
        # COMPLETED -> ACTIVE is NOT valid (terminal state)
        assert not SessionState.COMPLETED.can_transition_to(SessionState.ACTIVE)


class TestSessionCreation:
    """Tests for session creation."""

    def test_create_new_session(self, tmp_path):
        """Create a new session."""
        manager = SessionManager(base_dir=tmp_path)
        
        session = manager.create_session(project_name="TestProject")
        
        assert session.project_name == "TestProject"
        assert session.state == SessionState.PENDING
        assert session.directory.exists()
        assert session.directory.is_dir()

    def test_session_directory_format(self, tmp_path):
        """Session directory should use timestamp format."""
        manager = SessionManager(base_dir=tmp_path)
        
        session = manager.create_session()
        
        # Directory name should match timestamp pattern
        dir_name = session.directory.name
        # Format: YYYY-MM-DD_HHMMSS_projectname
        assert dir_name[4] == "-"  # After year
        assert dir_name[7] == "-"  # After month
        assert dir_name[10] == "_"  # Separator

    def test_session_files_created(self, tmp_path):
        """Session should create required files."""
        manager = SessionManager(base_dir=tmp_path)
        
        session = manager.create_session()
        
        # Transcript file should be created (empty)
        transcript_file = session.directory / "transcript.jsonl"
        assert transcript_file.exists()
        assert transcript_file.stat().st_size == 0
        
        # Spec draft should exist
        spec_file = session.directory / "spec_draft.md"
        assert spec_file.exists()

    def test_session_id_unique(self, tmp_path):
        """Each session should have a unique ID."""
        manager = SessionManager(base_dir=tmp_path)
        
        # Create sessions with different project names to avoid collision
        sessions = [manager.create_session(project_name=f"proj_{i}") for i in range(10)]
        
        ids = [s.id for s in sessions]
        assert len(ids) == len(set(ids))  # All unique


class TestSessionLoading:
    """Tests for loading existing sessions."""

    def test_load_existing_session(self, tmp_path):
        """Load an existing session by ID."""
        manager = SessionManager(base_dir=tmp_path)
        original = manager.create_session(project_name="LoadMe")
        session_id = original.id
        
        loaded = manager.load_session(session_id)
        
        assert loaded.id == session_id
        assert loaded.project_name == "LoadMe"

    def test_load_nonexistent_session_raises(self, tmp_path):
        """Loading non-existent session should raise."""
        manager = SessionManager(base_dir=tmp_path)
        
        with pytest.raises(SessionNotFoundError):
            manager.load_session("nonexistent-id")

    def test_load_corrupted_session_raises(self, tmp_path):
        """Loading corrupted session should raise."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        
        # Corrupt the session metadata
        metadata_file = session.directory / "session.json"
        metadata_file.write_text("not valid json{{{")
        
        with pytest.raises(SessionCorruptedError):
            manager.load_session(session.id)


class TestSessionRecovery:
    """Tests for session recovery functionality."""

    def test_detect_incomplete_session(self, tmp_path):
        """Should detect incomplete sessions from transcript."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        
        # Write partial transcript
        transcript_file = session.directory / "transcript.jsonl"
        transcript_file.write_text(json.dumps({
            "round": 1,
            "type": "question",
            "content": "Q1?",
            "timestamp": "2026-04-28T10:00:00Z"
        }) + "\n")
        
        assert session.is_complete is False
        # last_round returns 0 because no complete round (needs question + answer)
        assert session.last_round == 0

    def test_detect_complete_session(self, tmp_path):
        """Should detect complete sessions."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        session.start()  # Must start before completing
        session.complete()
        
        # After complete(), final_spec.md should exist
        assert session.final_spec_file.exists()
        assert session.is_complete is True

    def test_recovery_finds_last_round(self, tmp_path):
        """Recovery should find the last complete round."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        
        # Write transcript with multiple rounds
        transcript_file = session.directory / "transcript.jsonl"
        lines = [
            json.dumps({"round": 1, "type": "question", "content": "Q1", "timestamp": "2026-04-28T10:00:00Z"}),
            json.dumps({"round": 1, "type": "answer", "content": "A1", "timestamp": "2026-04-28T10:01:00Z"}),
            json.dumps({"round": 2, "type": "question", "content": "Q2", "timestamp": "2026-04-28T10:02:00Z"}),
            json.dumps({"round": 2, "type": "answer", "content": "A2", "timestamp": "2026-04-28T10:03:00Z"}),
        ]
        transcript_file.write_text("\n".join(lines) + "\n")
        
        assert session.last_round == 2
        assert session.last_turn_type == "answer"

    def test_recovery_handles_partial_round(self, tmp_path):
        """Partial round should be handled (only question, no answer)."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        
        # Write transcript with partial round
        transcript_file = session.directory / "transcript.jsonl"
        transcript_file.write_text(json.dumps({
            "round": 1,
            "type": "question",
            "content": "Q1?",
            "timestamp": "2026-04-28T10:00:00Z"
        }) + "\n")
        
        # last_round returns 0 because no complete round (needs question + answer)
        assert session.last_round == 0
        # last_turn_type returns 'question' because that's the last entry
        assert session.last_turn_type == "question"


class TestSessionList:
    """Tests for listing sessions."""

    def test_list_sessions(self, tmp_path):
        """List all sessions."""
        manager = SessionManager(base_dir=tmp_path)
        manager.create_session(project_name="Proj1")
        manager.create_session(project_name="Proj2")
        manager.create_session(project_name="Proj3")
        
        sessions = manager.list_sessions()
        
        assert len(sessions) == 3
        project_names = [s.project_name for s in sessions]
        assert "Proj1" in project_names
        assert "Proj2" in project_names
        assert "Proj3" in project_names

    def test_list_sessions_sorted(self, tmp_path):
        """Sessions should be sorted by creation time (newest first)."""
        manager = SessionManager(base_dir=tmp_path)
        s1 = manager.create_session(project_name="First")
        s2 = manager.create_session(project_name="Second")
        s3 = manager.create_session(project_name="Third")
        
        sessions = manager.list_sessions()
        
        # Newest first
        assert sessions[0].project_name == "Third"
        assert sessions[1].project_name == "Second"
        assert sessions[2].project_name == "First"


class TestSessionStateManagement:
    """Tests for session state transitions."""

    def test_start_session(self, tmp_path):
        """Starting a session transitions from PENDING to ACTIVE."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        
        session.start()
        
        assert session.state == SessionState.ACTIVE

    def test_complete_session(self, tmp_path):
        """Completing a session transitions to COMPLETED."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        session.start()
        
        session.complete()
        
        assert session.state == SessionState.COMPLETED
        assert session.directory.joinpath("final_spec.md").exists()

    def test_fail_session(self, tmp_path):
        """Failing a session transitions to FAILED."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        session.start()
        
        session.fail(error_message="Something went wrong")
        
        assert session.state == SessionState.FAILED
        # Should have error logged
        metadata = session.metadata
        assert metadata.error == "Something went wrong"


class TestSessionTranscripts:
    """Tests for transcript operations."""

    def test_append_to_transcript(self, tmp_path):
        """Append entries to transcript."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        
        session.append_transcript(round=1, type="question", content="Q1?")
        session.append_transcript(round=1, type="answer", content="A1")
        
        transcript_file = session.directory / "transcript.jsonl"
        lines = transcript_file.read_text().strip().split("\n")
        
        assert len(lines) == 2

    def test_read_transcript(self, tmp_path):
        """Read transcript entries."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        
        session.append_transcript(round=1, type="question", content="Q1?")
        session.append_transcript(round=1, type="answer", content="A1")
        
        entries = session.read_transcript()
        
        assert len(entries) == 2
        assert entries[0].content == "Q1?"
        assert entries[1].content == "A1"


class TestSessionSpecDraft:
    """Tests for spec draft operations."""

    def test_update_spec_draft(self, tmp_path):
        """Update the spec draft."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        
        session.update_spec_draft("# New Spec\n\nContent here.")
        
        spec_file = session.directory / "spec_draft.md"
        assert "# New Spec" in spec_file.read_text()

    def test_get_spec_draft(self, tmp_path):
        """Get current spec draft content."""
        manager = SessionManager(base_dir=tmp_path)
        session = manager.create_session()
        session.update_spec_draft("# Test Spec\n\nTest content.")
        
        draft = session.get_spec_draft()
        
        assert "# Test Spec" in draft
        assert "Test content." in draft


# Fixtures

@pytest.fixture
def session_manager(tmp_path):
    """Create a SessionManager with temp directory."""
    return SessionManager(base_dir=tmp_path)
