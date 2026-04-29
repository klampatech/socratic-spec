"""Interrogator output parser."""

from __future__ import annotations

import re
from dataclasses import dataclass

from socratic_spec.exceptions import ParseError


# Delimiter that separates spec draft from next question
DELIMITER = "---RESPONDEE_REVIEW_ONLY---"

# Section headers
SPEC_DRAFT_HEADER = "[SYNTHESIZED SPEC DRAFT]"
NEXT_QUESTION_HEADER = "[NEXT QUESTION]"

# Pattern to match section headers (case-sensitive)
HEADER_PATTERN = re.compile(r"^\[SYNTHESIZED SPEC DRAFT\]$|^\[NEXT QUESTION\]$")


@dataclass
class InterrogatorOutput:
    """Result of parsing Interrogator output.
    
    Attributes:
        spec_draft: The synthesized spec draft markdown
        next_question: The next question to ask (or "DONE")
        raw_output: The original raw output text
        is_complete: True if interrogation is complete (DONE received)
    """

    spec_draft: str
    next_question: str
    raw_output: str

    @property
    def is_complete(self) -> bool:
        """Check if interrogation is complete."""
        return self.next_question.strip().upper() == "DONE"


class InterrogatorOutputParser:
    """Parser for Interrogator agent output.
    
    Parses output that follows the format:
    
        [SYNTHESIZED SPEC DRAFT]
        <spec draft content>
        
        ---RESPONDEE_REVIEW_ONLY---
        
        [NEXT QUESTION]
        <next question or DONE>
    """

    def __init__(self):
        """Initialize parser."""
        pass

    def parse(self, output: str) -> InterrogatorOutput:
        """Parse Interrogator output.
        
        Args:
            output: Raw output from Interrogator agent
            
        Returns:
            InterrogatorOutput with parsed data
            
        Raises:
            ParseError: If output format is invalid
        """
        self._validate_format(output)
        
        # Split on delimiter
        if DELIMITER not in output:
            raise ParseError(
                f"Missing delimiter '{DELIMITER}' in output",
                source="interrogator",
            )

        parts = output.split(DELIMITER, 1)
        if len(parts) != 2:
            raise ParseError(
                f"Expected exactly one delimiter, found {len(parts) - 1}",
                source="interrogator",
            )

        spec_part, question_part = parts

        # Extract spec draft
        spec_draft = self._extract_section(spec_part, SPEC_DRAFT_HEADER)
        
        # Extract next question
        next_question = self._extract_section(question_part, NEXT_QUESTION_HEADER)

        return InterrogatorOutput(
            spec_draft=spec_draft,
            next_question=next_question,
            raw_output=output,
        )

    def _validate_format(self, output: str) -> None:
        """Validate basic output format.
        
        Args:
            output: Raw output to validate
            
        Raises:
            ParseError: If format is invalid
        """
        if not output or not output.strip():
            raise ParseError(
                "Output is empty",
                source="interrogator",
            )

    def _extract_section(self, text: str, header: str) -> str:
        """Extract content after a section header.
        
        Args:
            text: Text containing header and content
            header: Section header to look for
            
        Returns:
            Content after header, stripped of whitespace
        """
        lines = text.strip().split("\n")
        content_lines: list[str] = []
        found_header = False

        for line in lines:
            stripped = line.strip()
            
            # Check for header (exact match, case-sensitive)
            if stripped == header:
                found_header = True
                continue
            
            # If we haven't found header yet, skip
            if not found_header:
                continue
            
            # If we find another header, stop
            if HEADER_PATTERN.match(stripped):
                break
            
            content_lines.append(line)

        return "\n".join(content_lines).strip()

    def parse_with_fallback(self, output: str) -> InterrogatorOutput:
        """Parse with fallback strategies.
        
        If the primary format fails, try to extract what we can.
        
        Args:
            output: Raw output from Interrogator agent
            
        Returns:
            InterrogatorOutput with best-effort parsing
        """
        # Try primary parse first
        try:
            return self.parse(output)
        except ParseError:
            pass

        # Fallback 1: Try without proper headers
        if DELIMITER in output:
            parts = output.split(DELIMITER, 1)
            return InterrogatorOutput(
                spec_draft=parts[0].strip(),
                next_question=parts[1].strip() if len(parts) > 1 else "",
                raw_output=output,
            )

        # Fallback 2: Try to find DONE anywhere
        done_match = re.search(r"\bDONE\b", output, re.IGNORECASE)
        if done_match:
            return InterrogatorOutput(
                spec_draft=output[:done_match.start()].strip(),
                next_question="DONE",
                raw_output=output,
            )

        # Fallback 3: Just return the whole thing as spec draft
        return InterrogatorOutput(
            spec_draft=output.strip(),
            next_question="",
            raw_output=output,
        )


def detect_done(output: str) -> bool:
    """Detect if output signals completion (DONE).
    
    Args:
        output: Raw Interrogator output
        
    Returns:
        True if DONE is detected
    """
    # Look for [NEXT QUESTION] DONE pattern
    if DELIMITER in output:
        parts = output.split(DELIMITER, 1)
        if NEXT_QUESTION_HEADER in parts[1]:
            question_section = parts[1].split(NEXT_QUESTION_HEADER, 1)
            if len(question_section) > 1:
                question_text = question_section[1].strip()
                return question_text.upper().startswith("DONE")
    
    return False
