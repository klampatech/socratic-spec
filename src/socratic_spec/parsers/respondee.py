"""Respondee output parser."""

from __future__ import annotations

import re
from dataclasses import dataclass

from socratic_spec.exceptions import ParseError


# Section header
ANSWER_HEADER = "[ANSWER]"

# Pattern for header at start of line
HEADER_PATTERN = re.compile(r"^\[ANSWER\]\s*:?\s*$", re.IGNORECASE)


@dataclass
class RespondeeOutput:
    """Result of parsing Respondee output.
    
    Attributes:
        answer: The answer content
        raw_output: The original raw output text
    """

    answer: str
    raw_output: str

    @property
    def is_empty(self) -> bool:
        """Check if answer is empty or whitespace only."""
        return not self.answer.strip()

    @property
    def length(self) -> int:
        """Get length of answer content."""
        return len(self.answer)

    @property
    def word_count(self) -> int:
        """Get word count of answer."""
        return len(self.answer.split())


class RespondeeOutputParser:
    """Parser for Respondee agent output.
    
    Parses output that follows the format:
    
        [ANSWER]
        <answer content>
    """

    def __init__(self):
        """Initialize parser."""
        pass

    def parse(self, output: str) -> RespondeeOutput:
        """Parse Respondee output.
        
        Args:
            output: Raw output from Respondee agent
            
        Returns:
            RespondeeOutput with parsed data
            
        Raises:
            ParseError: If output format is invalid
        """
        self._validate_format(output)
        
        # Find the [ANSWER] header
        lines = output.split("\n")
        header_index = -1
        
        for i, line in enumerate(lines):
            stripped = line.strip()
            # Header must be at start of line (with optional leading whitespace)
            if stripped == ANSWER_HEADER or stripped.upper() == ANSWER_HEADER:
                # Check it's truly at line start (not mid-line)
                if line.lstrip().startswith("["):
                    header_index = i
                    break
        
        if header_index == -1:
            raise ParseError(
                f"Missing '[ANSWER]' header in output",
                source="respondee",
            )

        # Extract content after header
        content_lines = lines[header_index + 1:]
        answer = "\n".join(content_lines).strip()

        return RespondeeOutput(
            answer=answer,
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
                source="respondee",
            )

    def parse_with_fallback(self, output: str) -> RespondeeOutput:
        """Parse with fallback strategies.
        
        If the primary format fails, try to extract what we can.
        
        Args:
            output: Raw output from Respondee agent
            
        Returns:
            RespondeeOutput with best-effort parsing
        """
        # Try primary parse first
        try:
            return self.parse(output)
        except ParseError:
            pass

        # Fallback: Use entire output as answer
        return RespondeeOutput(
            answer=output.strip(),
            raw_output=output,
        )


def extract_answer(output: str) -> str:
    """Extract answer from Respondee output.
    
    This is a convenience function that wraps parse_with_fallback.
    
    Args:
        output: Raw output from Respondee agent
        
    Returns:
        Extracted answer text
    """
    parser = RespondeeOutputParser()
    return parser.parse_with_fallback(output).answer
