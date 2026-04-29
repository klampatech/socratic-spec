"""Parsers for Socratic Spec outputs."""

from socratic_spec.exceptions import ParseError

from socratic_spec.parsers.transcript import (
    TranscriptParser,
    TranscriptEntry,
    ParseError as TranscriptParseError,
    read_transcript,
    write_transcript_entry,
    get_last_round,
)
from socratic_spec.parsers.interrogator import (
    InterrogatorOutputParser,
    InterrogatorOutput,
    ParseError as InterrogatorParseError,
)
from socratic_spec.parsers.respondee import (
    RespondeeOutputParser,
    RespondeeOutput,
    ParseError as RespondeeParseError,
)
from socratic_spec.parsers.spec_draft import (
    SpecDraftParser,
    SpecDraft,
    SpecSection,
    parse_spec_draft,
    validate_spec_draft,
)

__all__ = [
    # Common
    "ParseError",
    # Transcript
    "TranscriptParser",
    "TranscriptEntry",
    "read_transcript",
    "write_transcript_entry",
    "get_last_round",
    # Interrogator
    "InterrogatorOutputParser",
    "InterrogatorOutput",
    # Respondee
    "RespondeeOutputParser",
    "RespondeeOutput",
    # Spec Draft
    "SpecDraftParser",
    "SpecDraft",
    "SpecSection",
    "parse_spec_draft",
    "validate_spec_draft",
]
