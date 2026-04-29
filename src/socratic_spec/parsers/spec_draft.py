"""Spec draft parser."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


# Required sections in a spec
REQUIRED_SECTIONS = ["Outcome"]
OPTIONAL_SECTIONS = [
    "Given Preconditions",
    "When Trigger",
    "Then Expectations",
    "Failure Modes",
    "Open Questions",
]


@dataclass
class SpecSection:
    """A section in the spec document.
    
    Attributes:
        name: Section name (e.g., "Outcome")
        content: Section content (markdown)
        line_number: Line where section starts
    """

    name: str
    content: str
    line_number: int


@dataclass
class SpecDraft:
    """Parsed spec draft document.
    
    Attributes:
        title: Document title (first # heading)
        sections: Dictionary of section name to SpecSection
        raw_content: Original markdown content
    """

    title: str
    sections: dict[str, SpecSection] = field(default_factory=dict)
    raw_content: str = ""

    def get_section(self, name: str) -> str | None:
        """Get section content by name.
        
        Args:
            name: Section name
            
        Returns:
            Section content or None if not found
        """
        section = self.sections.get(name)
        return section.content if section else None

    def has_section(self, name: str) -> bool:
        """Check if section exists.
        
        Args:
            name: Section name
            
        Returns:
            True if section exists
        """
        return name in self.sections

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "title": self.title,
            "sections": {
                name: {"content": sec.content, "line_number": sec.line_number}
                for name, sec in self.sections.items()
            },
        }


class SpecDraftParser:
    """Parser for spec draft markdown documents.
    
    Parses markdown spec documents with sections like:
    
        # Title
        
        ## Outcome
        Content here.
        
        ## Given Preconditions
        - Item 1
        - Item 2
    """

    # Pattern for top-level heading (# Title)
    TITLE_PATTERN = re.compile(r"^#\s+(.+)$", re.MULTILINE)

    # Pattern for section headings (## Section Name)
    SECTION_PATTERN = re.compile(r"^##\s+(.+)$", re.MULTILINE)

    def __init__(self):
        """Initialize parser."""
        pass

    def parse(self, content: str) -> SpecDraft:
        """Parse spec draft content.
        
        Args:
            content: Markdown content
            
        Returns:
            SpecDraft with parsed sections
        """
        if not content or not content.strip():
            return SpecDraft(title="Untitled", raw_content=content)

        # Extract title
        title = self._extract_title(content)
        
        # Extract sections
        sections = self._extract_sections(content)
        
        return SpecDraft(
            title=title,
            sections=sections,
            raw_content=content,
        )

    def _extract_title(self, content: str) -> str:
        """Extract document title from first # heading.
        
        Args:
            content: Markdown content
            
        Returns:
            Title text or "Untitled"
        """
        match = self.TITLE_PATTERN.search(content)
        if match:
            return match.group(1).strip()
        return "Untitled"

    def _extract_sections(self, content: str) -> dict[str, SpecSection]:
        """Extract all sections from content.
        
        Args:
            content: Markdown content
            
        Returns:
            Dictionary mapping section name to SpecSection
        """
        sections: dict[str, SpecSection] = {}
        lines = content.split("\n")

        current_section: str | None = None
        current_content: list[str] = []
        current_line = 0

        for i, line in enumerate(lines, start=1):
            # Check for section heading
            match = self.SECTION_PATTERN.match(line)
            if match:
                # Save previous section
                if current_section:
                    sections[current_section] = SpecSection(
                        name=current_section,
                        content="\n".join(current_content).strip(),
                        line_number=current_line,
                    )

                # Start new section
                current_section = match.group(1).strip()
                current_content = []
                current_line = i
            elif current_section:
                current_content.append(line)

        # Save last section
        if current_section:
            sections[current_section] = SpecSection(
                name=current_section,
                content="\n".join(current_content).strip(),
                line_number=current_line,
            )

        return sections

    def validate(self, spec: SpecDraft) -> list[str]:
        """Validate spec draft completeness.
        
        Args:
            spec: Parsed spec draft
            
        Returns:
            List of validation error messages
        """
        errors: list[str] = []

        # Check for title
        if not spec.title or spec.title == "Untitled":
            errors.append("Missing or empty document title")

        # Check required sections
        for section_name in REQUIRED_SECTIONS:
            if not spec.has_section(section_name):
                errors.append(f"Missing required section: {section_name}")

        # Check for empty required sections
        for section_name in REQUIRED_SECTIONS:
            content = spec.get_section(section_name)
            if content is not None and not content.strip():
                errors.append(f"Empty required section: {section_name}")

        return errors

    def generate_markdown(self, spec: SpecDraft) -> str:
        """Generate markdown from parsed spec.
        
        Args:
            spec: Parsed spec draft
            
        Returns:
            Markdown string
        """
        lines: list[str] = [f"# {spec.title}", ""]

        # Output sections in order
        section_order = [
            "Outcome",
            "Given Preconditions",
            "When Trigger",
            "Then Expectations",
            "Failure Modes",
            "Open Questions",
        ]

        for section_name in section_order:
            if spec.has_section(section_name):
                content = spec.get_section(section_name)
                if content:
                    lines.append(f"## {section_name}")
                    lines.append("")
                    lines.append(content)
                    lines.append("")

        return "\n".join(lines).strip()


def parse_spec_draft(content: str) -> SpecDraft:
    """Parse spec draft content.
    
    Convenience function.
    
    Args:
        content: Markdown content
        
    Returns:
        Parsed SpecDraft
    """
    parser = SpecDraftParser()
    return parser.parse(content)


def validate_spec_draft(content: str) -> tuple[bool, list[str]]:
    """Validate spec draft content.
    
    Args:
        content: Markdown content
        
    Returns:
        Tuple of (is_valid, list of errors)
    """
    parser = SpecDraftParser()
    spec = parser.parse(content)
    errors = parser.validate(spec)
    return len(errors) == 0, errors
