"""Transcript JSONL parser."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterator, Literal

from socratic_spec.exceptions import ParseError


# Valid turn types
VALID_TYPES = {"question", "answer", "system"}


@dataclass
class TranscriptEntry:
    """A single entry in the transcript.
    
    Attributes:
        round: The round number (1-indexed)
        type: The type of entry (question, answer, system)
        content: The content of the entry
        timestamp: The timestamp when the entry was created
    """

    round: int
    type: Literal["question", "answer", "system"]
    content: str
    timestamp: datetime

    def to_dict(self) -> dict:
        """Convert entry to dictionary for JSON serialization."""
        return {
            "round": self.round,
            "type": self.type,
            "content": self.content,
            "timestamp": self.timestamp.strftime("%Y-%m-%dT%H:%M:%S"),
        }

    @classmethod
    def from_dict(cls, data: dict) -> TranscriptEntry:
        """Create entry from dictionary."""
        # Parse timestamp
        ts_str = data.get("timestamp", "")
        if isinstance(ts_str, datetime):
            timestamp = ts_str
        else:
            # Handle various ISO formats
            timestamp = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))

        return cls(
            round=int(data["round"]),
            type=data["type"],
            content=data["content"],
            timestamp=timestamp,
        )


class TranscriptParser:
    """Parser for transcript JSONL files.
    
    Parses JSONL transcript files, validating schema and handling
    corruption gracefully when strict=False.
    """

    def __init__(self, strict: bool = True):
        """Initialize parser.
        
        Args:
            strict: If True, raise on invalid data. If False, skip invalid lines.
        """
        self.strict = strict

    def parse_line(self, line: str) -> Iterator[TranscriptEntry]:
        """Parse a single JSONL line.
        
        Args:
            line: A single line of JSONL
            
        Yields:
            TranscriptEntry for the parsed line
            
        Raises:
            ParseError: If line is invalid and strict=True
        """
        # Strip whitespace
        line = line.strip()
        
        # Skip empty lines and comments
        if not line or line.startswith("#"):
            return

        try:
            data = json.loads(line)
        except json.JSONDecodeError as e:
            if self.strict:
                raise ParseError(
                    f"Invalid JSON: {e}",
                    line=0,
                )
            return

        # Validate required fields
        required_fields = ["round", "type", "content", "timestamp"]
        for field in required_fields:
            if field not in data:
                if self.strict:
                    raise ParseError(
                        f"Missing required field: {field}",
                        source="transcript",
                    )
                return

        # Validate round
        try:
            round_num = int(data["round"])
            if round_num < 1:
                if self.strict:
                    raise ParseError(
                        f"round must be positive, got {round_num}",
                        source="transcript",
                    )
                return
        except (ValueError, TypeError):
            if self.strict:
                raise ParseError(
                    f"round must be an integer",
                    source="transcript",
                )
            return

        # Validate type
        entry_type = data["type"]
        if entry_type not in VALID_TYPES:
            if self.strict:
                raise ParseError(
                    f"Invalid type '{entry_type}', must be one of {VALID_TYPES}",
                    source="transcript",
                )
            return

        # Validate timestamp
        try:
            ts_str = data["timestamp"]
            if isinstance(ts_str, str):
                datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            elif not isinstance(ts_str, datetime):
                if self.strict:
                    raise ParseError(
                        f"Invalid timestamp format",
                        source="transcript",
                    )
                return
        except ValueError:
            if self.strict:
                raise ParseError(
                    f"Invalid timestamp: {data.get('timestamp')}",
                    source="transcript",
                )
            return

        # Validate content
        if not isinstance(data["content"], str):
            if self.strict:
                raise ParseError(
                    f"content must be a string",
                    source="transcript",
                )
            return

        yield TranscriptEntry.from_dict(data)

    def parse_lines(self, lines: list[str], strict: bool | None = None) -> Iterator[TranscriptEntry]:
        """Parse multiple JSONL lines.
        
        Args:
            lines: List of JSONL lines
            strict: Override strict mode for this call
            
        Yields:
            TranscriptEntry for each valid line
        """
        if strict is None:
            strict = self.strict

        parser = TranscriptParser(strict=strict)
        for line in lines:
            yield from parser.parse_line(line)

    def parse_file(self, file_path: Path, strict: bool | None = None) -> Iterator[TranscriptEntry]:
        """Parse a transcript JSONL file.
        
        Args:
            file_path: Path to transcript file
            strict: Override strict mode for this call
            
        Yields:
            TranscriptEntry for each valid line
            
        Raises:
            FileNotFoundError: If file doesn't exist
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Transcript file not found: {file_path}")

        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                yield from self.parse_line(line)


def write_transcript_entry(file_path: Path, entry: TranscriptEntry) -> None:
    """Write a single entry to transcript file.
    
    Args:
        file_path: Path to transcript file
        entry: Entry to write
    """
    with open(file_path, "a", encoding="utf-8") as f:
        json_line = json.dumps(entry.to_dict(), ensure_ascii=False)
        f.write(json_line + "\n")


def read_transcript(file_path: Path) -> list[TranscriptEntry]:
    """Read all entries from a transcript file.
    
    Args:
        file_path: Path to transcript file
        
    Returns:
        List of TranscriptEntry objects
    """
    parser = TranscriptParser(strict=True)
    return list(parser.parse_file(file_path))


def get_last_round(file_path: Path) -> int:
    """Get the last complete round number from transcript.
    
    Args:
        file_path: Path to transcript file
        
    Returns:
        Last complete round number (0 if no complete rounds)
    """
    entries = read_transcript(file_path)
    
    if not entries:
        return 0
    
    # Group by round
    rounds: dict[int, list[str]] = {}
    for entry in entries:
        if entry.round not in rounds:
            rounds[entry.round] = []
        rounds[entry.round].append(entry.type)
    
    # Find last complete round (has both question and answer)
    for round_num in sorted(rounds.keys(), reverse=True):
        types = set(rounds[round_num])
        if "question" in types and "answer" in types:
            return round_num
    
    return 0


def validate_transcript(file_path: Path) -> tuple[bool, list[str]]:
    """Validate a transcript file.
    
    Args:
        file_path: Path to transcript file
        
    Returns:
        Tuple of (is_valid, list of error messages)
    """
    errors: list[str] = []
    
    try:
        entries = read_transcript(file_path)
    except ParseError as e:
        return False, [str(e)]
    
    # Check for alternating pattern
    for i, entry in enumerate(entries):
        expected_type = "question" if i % 2 == 0 else "answer"
        if entry.type != expected_type:
            errors.append(
                f"Round {entry.round}: Expected {expected_type}, got {entry.type}"
            )
    
    return len(errors) == 0, errors
