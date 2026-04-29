"""Main orchestrator for the spec refinement loop."""

from __future__ import annotations

import signal
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from socratic_spec.config import Config
from socratic_spec.exceptions import SocraticSpecError, TimeoutError as SpecTimeoutError
from socratic_spec.logging_config import get_logger
from socratic_spec.parsers.interrogator import InterrogatorOutput
from socratic_spec.parsers.respondee import RespondeeOutput
from socratic_spec.session import Session, SessionManager, SessionState
from socratic_spec.pi_client import PiClient, check_pi_available
from socratic_spec.agents import InterrogatorRunner, RespondeeRunner, AgentConfig


logger = get_logger("orchestrator")


@dataclass
class OrchestratorResult:
    """Result of an orchestration run.
    
    Attributes:
        is_complete: Whether the run completed successfully
        rounds_completed: Number of Q&A rounds completed
        session_id: ID of the session
        error: Error message if failed
    """
    
    is_complete: bool = False
    rounds_completed: int = 0
    session_id: str = ""
    error: str | None = None
    spec_content: str = ""


class Orchestrator:
    """Orchestrates the spec refinement Q&A loop.
    
    Manages the round-robin between Interrogator and Respondee agents,
    updating the spec draft after each answer.
    """

    def __init__(self, config: Config):
        """Initialize orchestrator.
        
        Args:
            config: Configuration object
        """
        self.config = config
        self.session: Session | None = None
        self.pi_client: PiClient | None = None
        self.interrogator: InterrogatorRunner | None = None
        self.respondee: RespondeeRunner | None = None
        self._should_stop = False
        
        # Set up signal handlers for graceful shutdown
        self._setup_signal_handlers()

    def _setup_signal_handlers(self) -> None:
        """Set up signal handlers for SIGINT/SIGTERM."""
        def signal_handler(signum: int, frame: Any) -> None:
            logger.warning(f"Received signal {signum}, shutting down gracefully...")
            self._should_stop = True
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

    def _validate_environment(self) -> None:
        """Validate environment before starting.
        
        Raises:
            SocraticSpecError: If environment is invalid
        """
        # Check pi CLI
        is_available, error_msg = check_pi_available()
        if not is_available:
            raise SocraticSpecError(f"pi CLI not available: {error_msg}")
        
        # Check context - can be file path or plain text
        if not self.config.context:
            raise SocraticSpecError("--context is required")
        
        # If context is a path, validate it exists
        context_path = Path(self.config.context)
        if not context_path.exists():
            # Not a valid file path - assume it's plain text
            logger.debug(f"Context is plain text, not a file path")

    def _initialize_session(self) -> Session:
        """Initialize or resume session.
        
        Returns:
            Session instance
        """
        session_manager = SessionManager(base_dir=self.config.output_dir)
        
        if self.config.resume_session_id:
            # Resume existing session
            logger.info(f"Resuming session: {self.config.resume_session_id}")
            session = session_manager.load_session(self.config.resume_session_id)
            
            # Start session if not already active
            if session.state == SessionState.PENDING:
                session.start()
        else:
            # Create new session
            logger.info(f"Creating new session for: {self.config.project_name}")
            
            # Determine context file (only if it's a path to an actual file)
            context_file = None
            context_value = self.config.context
            if isinstance(context_value, Path) and context_value.exists():
                context_file = context_value
            
            session = session_manager.create_session(
                project_name=self.config.project_name,
                context_file=context_file,
            )
            session.start()
        
        return session

    def _initialize_agents(self) -> None:
        """Initialize pi client and agent runners."""
        # Create pi client
        self.pi_client = PiClient(
            pi_command="pi",
            timeout=300,  # 5 minutes per turn
        )
        
        # Create agent configs
        interrogator_config = AgentConfig(
            model=self.config.get_interrogator_model(),
            template_dir=self.config.template_dir,
        )
        
        respondee_config = AgentConfig(
            model=self.config.get_respondee_model(),
            template_dir=self.config.template_dir,
        )
        
        # Create runners
        self.interrogator = InterrogatorRunner(
            pi_client=self.pi_client,
            config=interrogator_config,
        )
        
        self.respondee = RespondeeRunner(
            pi_client=self.pi_client,
            config=respondee_config,
        )

    def run(self) -> OrchestratorResult:
        """Run the orchestration loop.
        
        Returns:
            OrchestratorResult with run outcome
        """
        try:
            # Validate environment
            self._validate_environment()
            
            # Initialize session
            self.session = self._initialize_session()
            
            # Initialize agents
            self._initialize_agents()
            
            # Load feature context (file path or plain text)
            context_value = self.config.context
            if isinstance(context_value, Path) and context_value.exists():
                feature_context = context_value.read_text()
                logger.info(f"Loaded context from file: {context_value}")
            else:
                feature_context = str(context_value)
                logger.info(f"Using context as plain text")
            
            # Run main loop
            return self._run_loop(feature_context)
            
        except SpecTimeoutError as e:
            logger.error(f"Timeout: {e}")
            if self.session:
                self.session.fail(str(e))
            return OrchestratorResult(
                is_complete=False,
                rounds_completed=self.session.metadata.rounds_completed if self.session else 0,
                session_id=self.session.id if self.session else "",
                error=f"Timeout: {e}",
            )
        except SocraticSpecError as e:
            logger.error(f"Error: {e}")
            if self.session:
                self.session.fail(str(e))
            return OrchestratorResult(
                is_complete=False,
                rounds_completed=self.session.metadata.rounds_completed if self.session else 0,
                session_id=self.session.id if self.session else "",
                error=str(e),
            )
        except Exception as e:
            logger.exception(f"Unexpected error: {e}")
            if self.session:
                self.session.fail(str(e))
            return OrchestratorResult(
                is_complete=False,
                rounds_completed=self.session.metadata.rounds_completed if self.session else 0,
                session_id=self.session.id if self.session else "",
                error=f"Unexpected error: {e}",
            )

    def _run_loop(self, feature_context: str) -> OrchestratorResult:
        """Run the main Q&A loop.
        
        Args:
            feature_context: Initial project description
            
        Returns:
            OrchestratorResult with run outcome
        """
        assert self.session is not None
        assert self.interrogator is not None
        assert self.respondee is not None
        
        current_round = self.session.last_round
        
        # If we have a partial round (question but no answer), skip to answer phase
        if self.session.last_turn_type == "question":
            logger.info(f"Resuming from round {current_round}, waiting for answer...")
            # Continue to answer phase - need to get previous question
            previous_question = self._get_last_question()
            if previous_question:
                # Run respondee and continue
                answer_output = self._run_respondee(previous_question)
                self.session.append_transcript(
                    round=current_round,
                    type="answer",
                    content=answer_output.answer,
                )
                current_round += 1
        
        # Main loop
        while current_round < self.config.max_rounds and not self._should_stop:
            logger.info(f"Round {current_round + 1}")
            
            # Interrogator asks question
            if current_round == 0 and self.session.last_turn_type is None:
                # First round - no prior Q&A
                interrogator_output = self.interrogator.run_first_turn(feature_context)
            else:
                # Subsequent rounds - include previous Q&A
                previous_question = self._get_last_question()
                previous_answer = self._get_last_answer()
                current_spec = self.session.get_spec_draft()
                
                interrogator_output = self.interrogator.run_subsequent_turn(
                    feature_context=feature_context,
                    current_spec_draft=current_spec,
                    previous_question=previous_question or "",
                    previous_answer=previous_answer or "",
                )
            
            # Update spec draft
            self.session.update_spec_draft(interrogator_output.spec_draft)
            
            # Log question to transcript
            self.session.append_transcript(
                round=current_round + 1,
                type="question",
                content=interrogator_output.next_question,
            )
            
            # Check for DONE
            if interrogator_output.is_complete:
                logger.info("Interrogator has no more questions. Spec complete.")
                self.session.complete()
                return OrchestratorResult(
                    is_complete=True,
                    rounds_completed=current_round + 1,
                    session_id=self.session.id,
                    spec_content=self.session.get_spec_draft(),
                )
            
            # Respondee answers
            answer_output = self._run_respondee(interrogator_output.next_question)
            
            # Log answer to transcript
            self.session.append_transcript(
                round=current_round + 1,
                type="answer",
                content=answer_output.answer,
            )
            
            current_round += 1
        
        # Max rounds reached
        if self._should_stop:
            logger.warning("Interrupted by user signal")
            return OrchestratorResult(
                is_complete=False,
                rounds_completed=current_round,
                session_id=self.session.id,
                error="Interrupted by user",
            )
        else:
            logger.warning(f"Max rounds ({self.config.max_rounds}) reached")
            self.session.complete()
            return OrchestratorResult(
                is_complete=True,
                rounds_completed=current_round,
                session_id=self.session.id,
                spec_content=self.session.get_spec_draft(),
            )

    def _run_respondee(self, question: str) -> RespondeeOutput:
        """Run Respondee agent.
        
        Args:
            question: Question to answer
            
        Returns:
            Respondee output
        """
        assert self.respondee is not None
        
        logger.debug(f"Asking Respondee: {question[:100]}...")
        return self.respondee.run(question)

    def _get_last_question(self) -> str | None:
        """Get the last question from transcript.
        
        Returns:
            Last question content or None
        """
        if not self.session:
            return None
        
        entries = self.session.read_transcript()
        for entry in reversed(entries):
            if entry.type == "question":
                return entry.content
        return None

    def _get_last_answer(self) -> str | None:
        """Get the last answer from transcript.
        
        Returns:
            Last answer content or None
        """
        if not self.session:
            return None
        
        entries = self.session.read_transcript()
        for entry in reversed(entries):
            if entry.type == "answer":
                return entry.content
        return None
