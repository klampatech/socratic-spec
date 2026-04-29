"""Tests for transcript JSONL parsing."""

import json
from datetime import datetime
from pathlib import Path

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from socratic_spec.parsers.transcript import (
    TranscriptParser,
    TranscriptEntry,
    ParseError,
)


class TestTranscriptParserBasic:
    """Basic transcript parsing tests."""

    def test_parse_single_entry(self):
        """Parse a single transcript entry."""
        parser = TranscriptParser()
        jsonl_line = json.dumps({
            "round": 1,
            "type": "question",
            "content": "What is the goal?",
            "timestamp": "2026-04-28T10:00:00Z"
        })
        
        entries = list(parser.parse_line(jsonl_line))
        
        assert len(entries) == 1
        assert entries[0].round == 1
        assert entries[0].type == "question"
        assert entries[0].content == "What is the goal?"
        # Timestamp may have timezone
        assert entries[0].timestamp.year == 2026

    def test_parse_multiple_entries(self):
        """Parse multiple JSONL lines."""
        parser = TranscriptParser()
        jsonl_data = """{"round": 1, "type": "question", "content": "Q1?", "timestamp": "2026-04-28T10:00:00Z"}
{"round": 1, "type": "answer", "content": "A1", "timestamp": "2026-04-28T10:01:00Z"}
{"round": 2, "type": "question", "content": "Q2?", "timestamp": "2026-04-28T10:02:00Z"}
"""
        
        entries = list(parser.parse_lines(jsonl_data.splitlines()))
        
        assert len(entries) == 3
        assert entries[0].type == "question"
        assert entries[1].type == "answer"
        assert entries[2].type == "question"

    def test_parse_from_file(self, tmp_path):
        """Parse transcript from file."""
        transcript_file = tmp_path / "transcript.jsonl"
        transcript_file.write_text("""{"round": 1, "type": "question", "content": "Start?", "timestamp": "2026-04-28T10:00:00Z"}
{"round": 1, "type": "answer", "content": "Started.", "timestamp": "2026-04-28T10:01:00Z"}
""")
        
        parser = TranscriptParser()
        entries = list(parser.parse_file(transcript_file))
        
        assert len(entries) == 2


class TestTranscriptParserValidation:
    """Tests for transcript schema validation."""

    def test_missing_required_field_round(self):
        """Missing 'round' field should raise ParseError."""
        parser = TranscriptParser()
        invalid_jsonl = '{"type": "question", "content": "Q", "timestamp": "2026-04-28T10:00:00Z"}'
        
        with pytest.raises(ParseError):
            list(parser.parse_line(invalid_jsonl))

    def test_missing_required_field_type(self):
        """Missing 'type' field should raise ParseError."""
        parser = TranscriptParser()
        invalid_jsonl = '{"round": 1, "content": "Q", "timestamp": "2026-04-28T10:00:00Z"}'
        
        with pytest.raises(ParseError):
            list(parser.parse_line(invalid_jsonl))

    def test_missing_required_field_content(self):
        """Missing 'content' field should raise ParseError."""
        parser = TranscriptParser()
        invalid_jsonl = '{"round": 1, "type": "question", "timestamp": "2026-04-28T10:00:00Z"}'
        
        with pytest.raises(ParseError):
            list(parser.parse_line(invalid_jsonl))

    def test_missing_required_field_timestamp(self):
        """Missing 'timestamp' field should raise ParseError."""
        parser = TranscriptParser()
        invalid_jsonl = '{"round": 1, "type": "question", "content": "Q"}'
        
        with pytest.raises(ParseError):
            list(parser.parse_line(invalid_jsonl))

    def test_invalid_type_value(self):
        """Invalid 'type' value should raise ParseError."""
        parser = TranscriptParser()
        invalid_jsonl = '{"round": 1, "type": "invalid_type", "content": "Q", "timestamp": "2026-04-28T10:00:00Z"}'
        
        with pytest.raises(ParseError, match="type.*invalid_type"):
            list(parser.parse_line(invalid_jsonl))

    def test_invalid_round_type(self):
        """'round' must be an integer."""
        parser = TranscriptParser()
        invalid_jsonl = '{"round": "one", "type": "question", "content": "Q", "timestamp": "2026-04-28T10:00:00Z"}'
        
        with pytest.raises(ParseError, match="round.*int"):
            list(parser.parse_line(invalid_jsonl))

    def test_negative_round(self):
        """Round must be positive."""
        parser = TranscriptParser()
        invalid_jsonl = '{"round": 0, "type": "question", "content": "Q", "timestamp": "2026-04-28T10:00:00Z"}'
        
        with pytest.raises(ParseError, match="round.*positive"):
            list(parser.parse_line(invalid_jsonl))

    def test_invalid_timestamp_format(self):
        """Invalid timestamp format should raise ParseError."""
        parser = TranscriptParser()
        invalid_jsonl = '{"round": 1, "type": "question", "content": "Q", "timestamp": "not-a-date"}'
        
        with pytest.raises(ParseError, match="timestamp.*invalid"):
            list(parser.parse_line(invalid_jsonl))


class TestTranscriptParserEdgeCases:
    """Edge case tests for transcript parsing."""

    def test_empty_file(self, tmp_path):
        """Empty transcript file should return empty list."""
        transcript_file = tmp_path / "empty.jsonl"
        transcript_file.write_text("")
        
        parser = TranscriptParser()
        entries = list(parser.parse_file(transcript_file))
        
        assert entries == []

    def test_whitespace_only_lines(self):
        """Whitespace-only lines should be skipped."""
        parser = TranscriptParser()
        lines = ["", "   ", "\t", '{"round": 1, "type": "question", "content": "Q", "timestamp": "2026-04-28T10:00:00Z"}']
        
        entries = list(parser.parse_lines(lines))
        
        assert len(entries) == 1

    def test_invalid_json_line_skipped_with_strict_false(self):
        """Invalid JSON lines should be skipped when strict=False."""
        parser = TranscriptParser(strict=False)
        lines = [
            "not json at all",
            '{"round": 1, "type": "question", "content": "Q", "timestamp": "2026-04-28T10:00:00Z"}',
        ]
        
        entries = list(parser.parse_lines(lines, strict=False))
        
        assert len(entries) == 1

    def test_invalid_json_raises_in_strict_mode(self):
        """Invalid JSON should raise in strict mode."""
        parser = TranscriptParser(strict=True)
        lines = ["not json at all"]
        
        with pytest.raises(ParseError, match="invalid JSON"):
            list(parser.parse_lines(lines, strict=True))

    def test_comments_ignored(self):
        """Lines starting with # should be treated as comments."""
        parser = TranscriptParser()
        lines = [
            '# This is a comment',
            '{"round": 1, "type": "question", "content": "Q", "timestamp": "2026-04-28T10:00:00Z"}',
        ]
        
        entries = list(parser.parse_lines(lines))
        
        assert len(entries) == 1

    def test_unicode_content_preserved(self):
        """Unicode in content should be preserved."""
        parser = TranscriptParser()
        jsonl = json.dumps({
            "round": 1,
            "type": "question",
            "content": "What about émojis? 🎉 And 日本語",
            "timestamp": "2026-04-28T10:00:00Z"
        })
        
        entries = list(parser.parse_line(jsonl))
        
        assert entries[0].content == "What about émojis? 🎉 And 日本語"

    def test_multiline_content(self):
        """Content with newlines should be preserved."""
        parser = TranscriptParser()
        jsonl = json.dumps({
            "round": 1,
            "type": "answer",
            "content": "Line 1\nLine 2\n\nParagraph break",
            "timestamp": "2026-04-28T10:00:00Z"
        })
        
        entries = list(parser.parse_line(jsonl))
        
        assert "\n" in entries[0].content
        assert entries[0].content.count("\n") == 2


class TestTranscriptEntry:
    """Tests for TranscriptEntry dataclass."""

    def test_entry_creation(self):
        """Create a valid transcript entry."""
        entry = TranscriptEntry(
            round=1,
            type="question",
            content="What?",
            timestamp=datetime(2026, 4, 28, 10, 0, 0)
        )
        
        assert entry.round == 1
        assert entry.type == "question"
        assert entry.content == "What?"
        assert entry.timestamp == datetime(2026, 4, 28, 10, 0, 0)

    def test_entry_to_dict(self):
        """Convert entry to dictionary."""
        entry = TranscriptEntry(
            round=1,
            type="question",
            content="What?",
            timestamp=datetime(2026, 4, 28, 10, 0, 0)
        )
        
        d = entry.to_dict()
        
        assert d["round"] == 1
        assert d["type"] == "question"
        assert d["content"] == "What?"
        assert d["timestamp"] == "2026-04-28T10:00:00"

    def test_entry_round_trip(self):
        """Entry to dict and back should preserve data."""
        original = TranscriptEntry(
            round=5,
            type="answer",
            content="Answer text",
            timestamp=datetime(2026, 4, 28, 10, 0, 0)
        )
        
        d = original.to_dict()
        restored = TranscriptEntry.from_dict(d)
        
        assert restored.round == original.round
        assert restored.type == original.type
        assert restored.content == original.content
