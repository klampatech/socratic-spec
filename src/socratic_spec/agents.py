"""Agent runners for Interrogator and Respondee."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from socratic_spec.pi_client import PiClient
from socratic_spec.parsers.interrogator import InterrogatorOutputParser, InterrogatorOutput
from socratic_spec.parsers.respondee import RespondeeOutputParser, RespondeeOutput


@dataclass
class AgentConfig:
    """Configuration for an agent.
    
    Attributes:
        model: Model to use (optional)
        timeout: Timeout in seconds
        template_dir: Directory for custom templates (optional)
    """
    
    model: str | None = None
    timeout: int = 300
    template_dir: Path | None = None


class InterrogatorRunner:
    """Runner for the Interrogator agent.
    
    Builds prompts and parses responses.
    """

    def __init__(
        self,
        pi_client: PiClient,
        config: AgentConfig | None = None
    ):
        """Initialize Interrogator runner.
        
        Args:
            pi_client: PiClient instance
            config: Optional agent configuration
        """
        self.pi_client = pi_client
        self.config = config or AgentConfig()
        self.parser = InterrogatorOutputParser()
        
        # Load template
        self._load_template()

    def _load_template(self) -> None:
        """Load the Interrogator system prompt template."""
        template_path = None
        
        if self.config.template_dir:
            template_path = self.config.template_dir / "interrogator_system.txt"
        else:
            # Use bundled template
            import socratic_spec
            pkg_dir = Path(socratic_spec.__file__).parent
            template_path = pkg_dir / "templates" / "interrogator_system.txt"
        
        if template_path and template_path.exists():
            self.system_prompt = template_path.read_text()
        else:
            # Fallback to inline template
            self.system_prompt = self._get_default_template()

    def _get_default_template(self) -> str:
        """Get default Interrogator system prompt."""
        return """You are an interrogator. Your only job is to ask probing questions that expose gaps, challenge assumptions, and force articulation of edge cases in a software project. You do not design. You do not write code. You do not produce solutions. You only ask questions.

After each answer, you must:
1. Synthesize the answer into the growing spec draft
2. Ask your next question based on the updated draft

Stop when you genuinely have nothing left to ask. Do not exit early out of politeness.

OUTPUT FORMAT:
After each answer, output your response as TWO sections separated by the literal delimiter "---RESPONDEE_REVIEW_ONLY---":

First line: "[SYNTHESIZED SPEC DRAFT]" (exactly, no quotes)
All lines until the delimiter: your updated spec draft in markdown

Line after delimiter: "[NEXT QUESTION]" (exactly, no quotes)
Remaining lines: your next question, OR the single word "DONE" if you have nothing left to ask."""

    def run_first_turn(self, feature_context: str) -> InterrogatorOutput:
        """Run the first turn (no prior Q&A).
        
        Args:
            feature_context: Initial project description
            
        Returns:
            Parsed Interrogator output
        """
        user_prompt = f"""{feature_context}

This is your first question — start by asking about the most critical unknown."""

        response = self.pi_client.run(
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            model=self.config.model,
        )

        return self.parser.parse_with_fallback(response.text)

    def run_subsequent_turn(
        self,
        feature_context: str,
        current_spec_draft: str,
        previous_question: str,
        previous_answer: str,
    ) -> InterrogatorOutput:
        """Run a subsequent turn.
        
        Args:
            feature_context: Initial project description
            current_spec_draft: Current state of the spec
            previous_question: Question that was asked
            previous_answer: Answer that was given
            
        Returns:
            Parsed Interrogator output
        """
        user_prompt = f"""Project: {feature_context}

Previous Answer: {previous_answer}

Please synthesize this answer into the spec draft and ask your next probing question.

Current Spec Draft:
{current_spec_draft}"""

        response = self.pi_client.run(
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            model=self.config.model,
        )

        return self.parser.parse_with_fallback(response.text)


class RespondeeRunner:
    """Runner for the Respondee agent.
    
    Builds prompts and parses responses.
    """

    def __init__(
        self,
        pi_client: PiClient,
        config: AgentConfig | None = None
    ):
        """Initialize Respondee runner.
        
        Args:
            pi_client: PiClient instance
            config: Optional agent configuration
        """
        self.pi_client = pi_client
        self.config = config or AgentConfig()
        self.parser = RespondeeOutputParser()
        
        # Load template
        self._load_template()

    def _load_template(self) -> None:
        """Load the Respondee system prompt template."""
        if self.config.template_dir:
            template_path = self.config.template_dir / "respondee_system.txt"
        else:
            # Use bundled template
            import socratic_spec
            pkg_dir = Path(socratic_spec.__file__).parent
            template_path = pkg_dir / "templates" / "respondee_system.txt"
        
        if template_path.exists():
            self.system_prompt = template_path.read_text()
        else:
            # Fallback to inline template
            self.system_prompt = self._get_default_template()

    def _get_default_template(self) -> str:
        """Get default Respondee system prompt."""
        return """You are a subject matter expert being interviewed. Answer questions directly, specifically, and with technical precision. Do not ramble. Do not hedge unnecessarily. When you don't know something, say so clearly. When an answer involves assumptions, state them explicitly.

OUTPUT FORMAT:
First line: "[ANSWER]" (exactly, no quotes)
Remaining lines: your direct, precise answer."""

    def run(self, question: str) -> RespondeeOutput:
        """Run Respondee to answer a question.
        
        Args:
            question: The question to answer
            
        Returns:
            Parsed Respondee output
        """
        response = self.pi_client.run(
            system_prompt=self.system_prompt,
            user_prompt=question,
            model=self.config.model,
        )

        return self.parser.parse_with_fallback(response.text)
