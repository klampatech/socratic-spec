"""Tests for Interrogator output parser."""

import pytest
from hypothesis import given, settings

from socratic_spec.parsers.interrogator import (
    InterrogatorOutputParser,
    InterrogatorOutput,
    ParseError,
)


class TestInterrogatorParserBasic:
    """Basic Interrogator output parsing tests."""

    def test_parse_valid_output(self):
        """Parse a valid Interrogator output."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# OAuth Authentication

## Outcome
Users authenticate via GitHub OAuth 2.0.

## Given Preconditions
- User has a GitHub account

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
What access scopes should the OAuth application request?"""
        
        result = parser.parse(output)
        
        assert result is not None
        assert "# OAuth Authentication" in result.spec_draft
        assert "What access scopes" in result.next_question
        assert result.next_question != "DONE"

    def test_parse_done_signal(self):
        """Parse when Interrogator signals DONE."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Complete Spec

## Outcome
All requirements have been documented.

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
DONE"""
        
        result = parser.parse(output)
        
        assert result.next_question == "DONE"
        assert result.is_complete is True

    def test_parse_empty_spec(self):
        """Parse when spec draft is minimal."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Project

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
What is the main goal?"""
        
        result = parser.parse(output)
        
        assert "# Project" in result.spec_draft
        assert "What is the main goal?" in result.next_question


class TestInterrogatorParserDelimiters:
    """Tests for delimiter handling."""

    def test_delimiter_must_be_present(self):
        """Output without delimiter should raise ParseError."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Spec Title

[NEXT QUESTION]
Some question?"""
        
        with pytest.raises(ParseError, match="delimiter"):
            parser.parse(output)

    def test_multiple_delimiters_uses_first(self):
        """Multiple delimiters - use the first one."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# First Spec

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
First question?

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
Second question?"""
        
        result = parser.parse(output)
        
        assert "First question?" in result.next_question
        # Should NOT contain the second delimiter's question
        assert result.next_question.count("---RESPONDEE_REVIEW_ONLY---") == 0


class TestInterrogatorParserSections:
    """Tests for section extraction."""

    def test_spec_draft_contains_headers(self):
        """Spec draft should contain markdown headers."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# My Project

## Outcome
Something happens.

## When Trigger
User does X.

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
Next question?"""
        
        result = parser.parse(output)
        
        assert "# My Project" in result.spec_draft
        assert "## Outcome" in result.spec_draft
        assert "## When Trigger" in result.spec_draft

    def test_spec_draft_stops_at_delimiter(self):
        """Spec draft should not include delimiter or question."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Spec
Draft content here.

---RESPONDEDE_REVIEW_ONLY---
[NEXT QUESTION]
Should not be in spec draft?"""
        
        result = parser.parse(output)
        
        assert "---RESPONDEE_REVIEW_ONLY---" not in result.spec_draft
        assert "Should not be in spec draft?" not in result.spec_draft

    def test_next_question_section(self):
        """Next question should be extracted correctly."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Spec

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
Tell me about error handling."""
        
        result = parser.parse(output)
        
        assert result.next_question == "Tell me about error handling."

    def test_next_question_with_multiline(self):
        """Multi-line next question should be extracted."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Spec

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
Consider the following scenarios:
1. Network timeout
2. Invalid input
3. Permission denied

What should happen in each case?"""
        
        result = parser.parse(output)
        
        assert "Network timeout" in result.next_question
        assert "Permission denied" in result.next_question


class TestInterrogatorParserFallback:
    """Tests for fallback parsing."""

    def test_fallback_for_missing_delimiter(self):
        """Fallback parser should handle missing delimiter."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Project Spec

## Outcome
Project does stuff.

[NEXT QUESTION]
Any follow-up questions?"""
        
        result = parser.parse_with_fallback(output)
        
        # Should still parse something
        assert result.spec_draft is not None or result.next_question is not None

    def test_fallback_for_missing_sections(self):
        """Fallback parser should handle incomplete output."""
        parser = InterrogatorOutputParser()
        output = """This is some output without proper sections.
Just raw text from the model."""
        
        result = parser.parse_with_fallback(output)
        
        # Fallback should return something usable
        assert result is not None


class TestInterrogatorParserEdgeCases:
    """Edge case tests."""

    def test_empty_spec_draft_section(self):
        """Empty spec draft section should be handled."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
First question?"""
        
        result = parser.parse(output)
        
        assert result.spec_draft.strip() == ""

    def test_whitespace_handling(self):
        """Whitespace should be handled correctly."""
        parser = InterrogatorOutputParser()
        output = """
    [SYNTHESIZED SPEC DRAFT]
    # Title
    
    ---RESPONDEE_REVIEW_ONLY---
    [NEXT QUESTION]
    Question?
    """
        
        result = parser.parse(output)
        
        assert "# Title" in result.spec_draft
        assert "Question?" in result.next_question

    def test_case_sensitive_sections(self):
        """Section headers should be case-sensitive."""
        parser = InterrogatorOutputParser()
        output = """[Synthesized Spec Draft]
# Title

---respondEE_REVIEW_ONLY---
[Next Question]
Question?"""
        
        # Case-sensitive, so this should NOT match
        with pytest.raises(ParseError):
            parser.parse(output)

    def test_done_with_just_done_word(self):
        """DONE should be recognized even with extra whitespace."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Complete

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
   DONE   """
        
        result = parser.parse(output)
        
        assert result.is_complete is True

    def test_done_case_insensitive(self):
        """DONE should be case-insensitive."""
        parser = InterrogatorOutputParser()
        output = """[SYNTHESIZED SPEC DRAFT]
# Complete

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
done"""
        
        result = parser.parse(output)
        
        assert result.is_complete is True


class TestInterrogatorOutput:
    """Tests for InterrogatorOutput dataclass."""

    def test_output_creation(self):
        """Create a valid output."""
        output = InterrogatorOutput(
            spec_draft="# Spec",
            next_question="Question?",
            raw_output="[SYNTHESIZED... all raw text]"
        )
        
        assert output.spec_draft == "# Spec"
        assert output.next_question == "Question?"
        assert output.is_complete is False

    def test_is_complete_property(self):
        """is_complete should be True when DONE."""
        output = InterrogatorOutput(
            spec_draft="# Spec",
            next_question="DONE",
            raw_output=""
        )
        
        assert output.is_complete is True

    def test_is_not_complete_for_question(self):
        """is_complete should be False for questions."""
        output = InterrogatorOutput(
            spec_draft="# Spec",
            next_question="What about X?",
            raw_output=""
        )
        
        assert output.is_complete is False
