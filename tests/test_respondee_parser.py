"""Tests for Respondee output parser."""

import pytest

from socratic_spec.parsers.respondee import (
    RespondeeOutputParser,
    RespondeeOutput,
    ParseError,
)


class TestRespondeeParserBasic:
    """Basic Respondee output parsing tests."""

    def test_parse_valid_output(self):
        """Parse a valid Respondee output."""
        parser = RespondeeOutputParser()
        output = """[ANSWER]
Users authenticate via OAuth 2.0 with GitHub as the primary provider.
We support both authorization code and implicit flows."""
        
        result = parser.parse(output)
        
        assert result is not None
        assert "OAuth 2.0" in result.answer
        assert "GitHub" in result.answer

    def test_parse_with_multiline_answer(self):
        """Parse multi-line answer."""
        parser = RespondeeOutputParser()
        output = """[ANSWER]
The system should:

1. Accept OAuth tokens
2. Validate token signatures
3. Extract user identity

If validation fails, return 401 Unauthorized."""
        
        result = parser.parse(output)
        
        assert "OAuth tokens" in result.answer
        assert "401 Unauthorized" in result.answer

    def test_parse_with_initial_whitespace(self):
        """Handle whitespace before [ANSWER]."""
        parser = RespondeeOutputParser()
        output = """
    [ANSWER]
    The answer is simple."""
        
        result = parser.parse(output)
        
        assert "answer is simple" in result.answer


class TestRespondeeParserDelimiters:
    """Tests for delimiter handling."""

    def test_answer_tag_required(self):
        """Output without [ANSWER] tag should raise ParseError."""
        parser = RespondeeOutputParser()
        output = """Just some text without the ANSWER tag."""
        
        with pytest.raises(ParseError, match="\\[ANSWER\\]"):
            parser.parse(output)

    def test_multiple_answer_tags(self):
        """Multiple [ANSWER] tags - should use first."""
        parser = RespondeeOutputParser()
        output = """[ANSWER]
First answer.

[ANSWER]
Second answer."""
        
        result = parser.parse(output)
        
        assert "First answer" in result.answer
        assert "Second answer" not in result.answer

    def test_answer_tag_case_sensitive(self):
        """[ANSWER] tag is case-sensitive."""
        parser = RespondeeOutputParser()
        output = """[answer]
Lowercase tag."""
        
        with pytest.raises(ParseError, match="\\[ANSWER\\]"):
            parser.parse(output)


class TestRespondeeParserContent:
    """Tests for content extraction."""

    def test_content_after_tag_only(self):
        """Only content after [ANSWER] should be extracted."""
        parser = RespondeeOutputParser()
        output = """Random text before.

[ANSWER]
The actual answer.

Random text after."""
        
        result = parser.parse(output)
        
        assert "Random text before" not in result.answer
        assert "The actual answer" in result.answer
        assert "Random text after" not in result.answer

    def test_empty_answer(self):
        """Empty answer after tag should be handled."""
        parser = RespondeeOutputParser()
        output = """[ANSWER]
"""
        
        result = parser.parse(output)
        
        assert result.answer.strip() == ""

    def test_whitespace_stripped(self):
        """Leading/trailing whitespace should be stripped."""
        parser = RespondeeOutputParser()
        output = """
    [ANSWER]
    
    Answer with leading/trailing whitespace.
    
    """
        
        result = parser.parse(output)
        
        assert result.answer.startswith("Answer")
        assert result.answer.endswith("whitespace.")

    def test_code_blocks_preserved(self):
        """Code blocks in answers should be preserved."""
        parser = RespondeeOutputParser()
        output = """[ANSWER]
Here's how to configure it:

```json
{
  "key": "value"
}
```

The JSON must be valid."""
        
        result = parser.parse(output)
        
        assert "```json" in result.answer
        assert '{"key": "value"}' in result.answer

    def test_special_characters_preserved(self):
        """Special characters should be preserved."""
        parser = RespondeeOutputParser()
        output = """[ANSWER]
Use <angle brackets>, [square brackets], and {curly braces}.
Include symbols: @#$%^&*()_+-=[]{}|;':",./<>?

And unicode: 日本語 🎉 émojis"""
        
        result = parser.parse(output)
        
        assert "<angle brackets>" in result.answer
        assert "日本語" in result.answer
        assert "🎉" in result.answer


class TestRespondeeParserFallback:
    """Tests for fallback parsing."""

    def test_fallback_for_missing_tag(self):
        """Fallback parser should handle missing [ANSWER] tag."""
        parser = RespondeeOutputParser()
        output = """This entire output is the answer without proper tagging."""
        
        result = parser.parse_with_fallback(output)
        
        assert "entire output is the answer" in result.answer

    def test_fallback_preserves_content(self):
        """Fallback should preserve all content."""
        parser = RespondeeOutputParser()
        output = """Some response text that should all be captured."""
        
        result = parser.parse_with_fallback(output)
        
        assert result.answer.strip() == "Some response text that should all be captured."

    def test_fallback_empty_output(self):
        """Fallback for empty output."""
        parser = RespondeeOutputParser()
        output = ""
        
        result = parser.parse_with_fallback(output)
        
        assert result.answer == ""


class TestRespondeeParserEdgeCases:
    """Edge case tests."""

    def test_answer_tag_at_start_of_line(self):
        """[ANSWER] must be at start of line."""
        parser = RespondeeOutputParser()
        output = """Not at start [ANSWER]
Answer text."""
        
        with pytest.raises(ParseError, match="\\[ANSWER\\].*start"):
            parser.parse(output)

    def test_answer_tag_with_spaces(self):
        """[ANSWER] can have surrounding spaces."""
        parser = RespondeeOutputParser()
        output = """  [ANSWER]  
Answer text."""
        
        result = parser.parse(output)
        
        assert "Answer text" in result.answer

    def test_answer_tag_with_extra_characters(self):
        """[ANSWER] with extra chars like [ANSWER]: should work."""
        parser = RespondeeOutputParser()
        output = """[ANSWER]:
The answer content."""
        
        result = parser.parse(output)
        
        assert "The answer content" in result.answer

    def test_very_long_answer(self):
        """Handle very long answers."""
        parser = RespondeeOutputParser()
        long_text = "x" * 10000
        output = f"""[ANSWER]
{long_text}"""
        
        result = parser.parse(output)
        
        assert len(result.answer) == 10000

    def test_answer_with_only_whitespace_lines(self):
        """Answer with blank lines should preserve them."""
        parser = RespondeeOutputParser()
        output = """[ANSWER]
Line 1.

Line 3 (after blank line)."""
        
        result = parser.parse(output)
        
        lines = result.answer.split("\n")
        assert "Line 1" in lines[0]
        assert len(lines) >= 3  # Should have blank line


class TestRespondeeOutput:
    """Tests for RespondeeOutput dataclass."""

    def test_output_creation(self):
        """Create a valid output."""
        output = RespondeeOutput(
            answer="The answer is 42.",
            raw_output="[ANSWER]\nThe answer is 42."
        )
        
        assert output.answer == "The answer is 42."
        assert "[ANSWER]" in output.raw_output

    def test_is_empty_property(self):
        """is_empty should be True for blank answers."""
        output = RespondeeOutput(answer="   ", raw_output="")
        
        assert output.is_empty is True

    def test_is_not_empty_for_content(self):
        """is_empty should be False for non-blank answers."""
        output = RespondeeOutput(answer="content", raw_output="")
        
        assert output.is_empty is False

    def test_length_property(self):
        """Length should count characters."""
        output = RespondeeOutput(answer="Hello", raw_output="")
        
        assert output.length == 5

    def test_word_count_property(self):
        """Word count should count words."""
        output = RespondeeOutput(answer="Hello world foo bar", raw_output="")
        
        assert output.word_count == 4
