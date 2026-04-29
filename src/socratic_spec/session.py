"""Session management for Socratic Spec."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from socratic_spec.exceptions import SessionNotFoundError, SessionCorruptedError
from socratic_spec.parsers.transcript import (
    TranscriptParser,
    TranscriptEntry,
    read_transcript,
    write_transcript_entry,
    get_last_round,
)


class SessionState(Enum):
    """State of a session."""

    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"

    def can_transition_to(self, new_state: SessionState) -> bool:
        """Check if transition to new state is valid.
        
        Valid transitions:
        - PENDING -> ACTIVE
        - ACTIVE -> COMPLETED
        - ACTIVE -> FAILED
        """
        valid_transitions = {
            SessionState.PENDING: {SessionState.ACTIVE},
            SessionState.ACTIVE: {SessionState.COMPLETED, SessionState.FAILED},
            SessionState.COMPLETED: set(),
            SessionState.FAILED: set(),
        }
        return new_state in valid_transitions.get(self, set())


@dataclass
class SessionMetadata:
    """Metadata for a session."""

    id: str
    project_name: str
    state: SessionState
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None
    last_round: int = 0
    rounds_completed: int = 0
    context_file: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        data = asdict(self)
        data["state"] = self.state.value
        data["created_at"] = self.created_at.isoformat()
        if self.started_at:
            data["started_at"] = self.started_at.isoformat()
        if self.completed_at:
            data["completed_at"] = self.completed_at.isoformat()
        return data

    @classmethod
    def from_dict(cls, data: dict) -> SessionMetadata:
        """Create from dictionary."""
        data = dict(data)  # Don't modify original
        data["state"] = SessionState(data["state"])
        data["created_at"] = datetime.fromisoformat(data["created_at"])
        if data.get("started_at"):
            data["started_at"] = datetime.fromisoformat(data["started_at"])
        if data.get("completed_at"):
            data["completed_at"] = datetime.fromisoformat(data["completed_at"])
        return cls(**data)


@dataclass
class Session:
    """A spec refinement session.
    
    Attributes:
        id: Unique session identifier
        directory: Session directory path
        metadata: Session metadata
        project_name: Name of the project being specified
    """

    id: str
    directory: Path
    metadata: SessionMetadata
    project_name: str

    @property
    def state(self) -> SessionState:
        """Get current session state."""
        return self.metadata.state

    @state.setter
    def state(self, value: SessionState) -> None:
        """Set session state with validation."""
        if not self.metadata.state.can_transition_to(value):
            raise ValueError(
                f"Cannot transition from {self.metadata.state.value} to {value.value}"
            )
        self.metadata.state = value

    @property
    def transcript_file(self) -> Path:
        """Get path to transcript file."""
        return self.directory / "transcript.jsonl"

    @property
    def spec_draft_file(self) -> Path:
        """Get path to spec draft file."""
        return self.directory / "spec_draft.md"

    @property
    def final_spec_file(self) -> Path:
        """Get path to final spec file."""
        return self.directory / "final_spec.md"

    @property
    def metadata_file(self) -> Path:
        """Get path to metadata file."""
        return self.directory / "session.json"

    @property
    def is_complete(self) -> bool:
        """Check if session is complete."""
        return self.state == SessionState.COMPLETED

    @property
    def last_round(self) -> int:
        """Get the last complete round number."""
        if not self.transcript_file.exists():
            return 0
        
        try:
            return get_last_round(self.transcript_file)
        except Exception:
            return 0

    @property
    def last_turn_type(self) -> str | None:
        """Get the type of the last turn."""
        if not self.transcript_file.exists():
            return None
        
        try:
            entries = read_transcript(self.transcript_file)
            if entries:
                return entries[-1].type
        except Exception:
            pass
        return None

    def start(self) -> None:
        """Mark session as started."""
        if self.state != SessionState.PENDING:
            raise ValueError(f"Cannot start session in state {self.state.value}")
        
        self.metadata.state = SessionState.ACTIVE
        self.metadata.started_at = datetime.now(timezone.utc)
        self._save_metadata()

    def complete(self) -> None:
        """Mark session as completed."""
        if self.state != SessionState.ACTIVE:
            raise ValueError(f"Cannot complete session in state {self.state.value}")
        
        self.metadata.state = SessionState.COMPLETED
        self.metadata.completed_at = datetime.now(timezone.utc)
        
        # Copy spec draft to final spec
        if self.spec_draft_file.exists():
            content = self.spec_draft_file.read_text()
            self.final_spec_file.write_text(content)
        
        self._save_metadata()

    def fail(self, error_message: str) -> None:
        """Mark session as failed.
        
        Args:
            error_message: Error description
        """
        if self.state not in {SessionState.PENDING, SessionState.ACTIVE}:
            raise ValueError(f"Cannot fail session in state {self.state.value}")
        
        self.metadata.state = SessionState.FAILED
        self.metadata.completed_at = datetime.now(timezone.utc)
        self.metadata.error = error_message
        self._save_metadata()

    def append_transcript(
        self,
        round: int,
        type: str,
        content: str
    ) -> None:
        """Append an entry to the transcript.
        
        Args:
            round: Round number
            type: Entry type (question, answer)
            content: Entry content
        """
        entry = TranscriptEntry(
            round=round,
            type=type,  # type: ignore
            content=content,
            timestamp=datetime.now(timezone.utc),
        )
        write_transcript_entry(self.transcript_file, entry)
        
        # Update metadata
        self.metadata.last_round = round
        if type == "answer":
            self.metadata.rounds_completed = round
        self._save_metadata()

    def read_transcript(self) -> list[TranscriptEntry]:
        """Read all transcript entries.
        
        Returns:
            List of transcript entries
        """
        if not self.transcript_file.exists():
            return []
        return read_transcript(self.transcript_file)

    def update_spec_draft(self, content: str) -> None:
        """Update the spec draft.
        
        Args:
            content: New spec draft content
        """
        self.spec_draft_file.write_text(content)

    def get_spec_draft(self) -> str:
        """Get current spec draft content.
        
        Returns:
            Spec draft content or empty string
        """
        if not self.spec_draft_file.exists():
            return ""
        return self.spec_draft_file.read_text()

    def _save_metadata(self) -> None:
        """Save metadata to file."""
        self.metadata_file.write_text(
            json.dumps(self.metadata.to_dict(), indent=2, ensure_ascii=False)
        )


class SessionManager:
    """Manager for session lifecycle.
    
    Creates, loads, and manages sessions.
    """

    def __init__(self, base_dir: Path | str = Path("sessions")):
        """Initialize session manager.
        
        Args:
            base_dir: Base directory for session storage
        """
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def create_session(
        self,
        project_name: str = "project",
        context_file: Path | None = None
    ) -> Session:
        """Create a new session.
        
        Args:
            project_name: Name of the project
            context_file: Optional path to context file
            
        Returns:
            New Session instance
        """
        # Generate unique session ID
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
        session_id = f"{timestamp}_{project_name.replace(' ', '_').lower()}"
        
        # Create session directory
        session_dir = self.base_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=False)
        
        # Create transcript file
        transcript_file = session_dir / "transcript.jsonl"
        transcript_file.touch()
        
        # Create spec draft file (empty)
        spec_file = session_dir / "spec_draft.md"
        spec_file.write_text("")
        
        # Create metadata
        metadata = SessionMetadata(
            id=session_id,
            project_name=project_name,
            state=SessionState.PENDING,
            created_at=datetime.now(timezone.utc),
            context_file=str(context_file) if context_file else None,
        )
        
        session = Session(
            id=session_id,
            directory=session_dir,
            metadata=metadata,
            project_name=project_name,
        )
        
        session._save_metadata()
        
        return session

    def load_session(self, session_id: str) -> Session:
        """Load an existing session.
        
        Args:
            session_id: Session ID to load
            
        Returns:
            Session instance
            
        Raises:
            SessionNotFoundError: If session doesn't exist
            SessionCorruptedError: If session data is invalid
        """
        # Find session directory
        session_dir = None
        for path in self.base_dir.iterdir():
            if path.is_dir() and path.name.startswith(session_id.split("_")[0]):
                if session_id in path.name:
                    session_dir = path
                    break
        
        if session_dir is None:
            raise SessionNotFoundError(session_id)
        
        # Load metadata
        metadata_file = session_dir / "session.json"
        if not metadata_file.exists():
            raise SessionCorruptedError(session_id, "Missing session.json")
        
        try:
            data = json.loads(metadata_file.read_text())
            metadata = SessionMetadata.from_dict(data)
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            raise SessionCorruptedError(session_id, str(e))
        
        return Session(
            id=metadata.id,
            directory=session_dir,
            metadata=metadata,
            project_name=metadata.project_name,
        )

    def list_sessions(self) -> list[Session]:
        """List all sessions.
        
        Returns:
            List of Session instances, sorted by creation time (newest first)
        """
        sessions: list[Session] = []
        
        for path in self.base_dir.iterdir():
            if not path.is_dir():
                continue
            
            metadata_file = path / "session.json"
            if not metadata_file.exists():
                continue
            
            try:
                data = json.loads(metadata_file.read_text())
                metadata = SessionMetadata.from_dict(data)
                session = Session(
                    id=metadata.id,
                    directory=path,
                    metadata=metadata,
                    project_name=metadata.project_name,
                )
                sessions.append(session)
            except Exception:
                continue
        
        # Sort by creation time, newest first
        sessions.sort(key=lambda s: s.metadata.created_at, reverse=True)
        return sessions

    def delete_session(self, session_id: str) -> None:
        """Delete a session.
        
        Args:
            session_id: Session ID to delete
            
        Raises:
            SessionNotFoundError: If session doesn't exist
        """
        session = self.load_session(session_id)
        
        import shutil
        shutil.rmtree(session.directory)
