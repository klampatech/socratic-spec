"""CLI interface for Socratic Spec."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import click

from socratic_spec import __version__
from socratic_spec.config import (
    Config,
    load_config,
    get_default_config_path,
)
from socratic_spec.logging_config import setup_logging, get_logger
from socratic_spec.orchestrator import Orchestrator, OrchestratorResult
from socratic_spec.exceptions import SocraticSpecError


@click.command()
@click.option(
    "--context",
    "-c",
    type=click.Path(exists=True, path_type=Path),
    required=True,
    help="Path to context file with project description",
)
@click.option(
    "--project-name",
    "-p",
    type=str,
    default="project",
    help="Name for the project (default: project)",
)
@click.option(
    "--max-rounds",
    "-r",
    type=int,
    default=50,
    help="Maximum number of Q&A rounds (default: 50)",
)
@click.option(
    "--output",
    "-o",
    type=click.Path(path_type=Path),
    default=Path("sessions"),
    help="Output directory for sessions (default: sessions/)",
)
@click.option(
    "--model",
    "-m",
    type=str,
    default=None,
    help="Model override for both agents",
)
@click.option(
    "--interrogator-model",
    type=str,
    default=None,
    help="Model for Interrogator agent",
)
@click.option(
    "--respondee-model",
    type=str,
    default=None,
    help="Model for Respondee agent",
)
@click.option(
    "--template-dir",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Directory with custom templates",
)
@click.option(
    "--resume",
    type=str,
    default=None,
    help="Resume from existing session ID",
)
@click.option(
    "--log-level",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"], case_sensitive=False),
    default="INFO",
    help="Logging level (default: INFO)",
)
@click.option(
    "--log-json/--no-log-json",
    default=False,
    help="Use JSON logging format",
)
@click.option(
    "--config",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Config file path (default: ~/.config/socratic_spec.toml)",
)
@click.version_option(version=__version__)
def cli(
    context: Path,
    project_name: str,
    max_rounds: int,
    output: Path,
    model: str | None,
    interrogator_model: str | None,
    respondee_model: str | None,
    template_dir: Path | None,
    resume: str | None,
    log_level: str,
    log_json: bool,
    config: Path | None,
) -> None:
    """Socratic Spec - A Two-Agent Specification Refinement Tool
    
    Iteratively refine specifications through Socratic questioning.
    One agent asks probing questions; the other answers. The result
    is a comprehensive specification document.
    """
    # Build config from CLI args
    cli_args: dict[str, Any] = {
        "context": context,
        "project_name": project_name,
        "max_rounds": max_rounds,
        "output_dir": output,
        "model": model,
        "interrogator_model": interrogator_model,
        "respondee_model": respondee_model,
        "template_dir": template_dir,
        "resume_session_id": resume,
        "log_level": log_level.upper(),
        "log_json": log_json,
    }
    
    # Load and merge config
    try:
        config_obj = load_config(cli_args, config)
    except Exception as e:
        click.echo(f"Configuration error: {e}", err=True)
        sys.exit(1)
    
    # Set up logging
    setup_logging(config_obj)
    logger = get_logger()
    
    logger.info(f"Starting socratic-spec v{__version__}")
    logger.debug(f"Config: {config_obj}")
    
    # Run orchestrator
    try:
        orchestrator = Orchestrator(config_obj)
        result = orchestrator.run()
        
        # Report result
        if result.is_complete:
            click.echo(click.style("\n✓ Spec refinement complete!", fg="green"))
            click.echo(f"  Session: {result.session_id}")
            click.echo(f"  Rounds: {result.rounds_completed}")
            
            if result.spec_content:
                spec_file = output / result.session_id / "final_spec.md"
                click.echo(f"  Output: {spec_file}")
        else:
            click.echo(click.style("\n✗ Spec refinement incomplete", fg="yellow"))
            click.echo(f"  Session: {result.session_id}")
            click.echo(f"  Rounds: {result.rounds_completed}")
            if result.error:
                click.echo(f"  Error: {result.error}")
            
            if result.spec_content:
                click.echo(f"\nPartial spec saved to: {output / result.session_id / 'spec_draft.md'}")
        
        sys.exit(0 if result.is_complete else 1)
        
    except SocraticSpecError as e:
        logger.error(f"Error: {e}")
        click.echo(click.style(f"\n✗ Error: {e}", fg="red"), err=True)
        sys.exit(1)
    except KeyboardInterrupt:
        logger.warning("Interrupted by user")
        click.echo(click.style("\n✗ Interrupted", fg="yellow"), err=True)
        sys.exit(130)
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        click.echo(click.style(f"\n✗ Unexpected error: {e}", fg="red"), err=True)
        sys.exit(1)


def main() -> None:
    """Entry point for console script."""
    cli()


if __name__ == "__main__":
    main()
