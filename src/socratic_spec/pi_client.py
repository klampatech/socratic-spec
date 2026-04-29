"""pi CLI client wrapper."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from socratic_spec.exceptions import PiCliError, TimeoutError as SpecTimeoutError


# Default pi command
DEFAULT_PI_COMMAND = "pi"

# Default timeout per turn (5 minutes)
DEFAULT_TIMEOUT = 300


@dataclass
class PiResponse:
    """Response from pi CLI.
    
    Attributes:
        text: Extracted text from agent response
        raw_json: Raw JSON data from pi
        exit_code: Process exit code
    """
    
    text: str
    raw_json: dict[str, Any] | None
    exit_code: int


class PiClient:
    """Client for interacting with pi CLI.
    
    Wraps subprocess calls to pi with JSONL parsing and error handling.
    """

    def __init__(
        self,
        pi_command: str = DEFAULT_PI_COMMAND,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        """Initialize pi client.
        
        Args:
            pi_command: Path to pi CLI (default: "pi")
            timeout: Timeout in seconds per call (default: 300)
        """
        self.pi_command = pi_command
        self.timeout = timeout
        
        # Check if pi is available
        self._check_availability()

    def _check_availability(self) -> None:
        """Check if pi CLI is available.
        
        Raises:
            PiCliError: If pi is not found
        """
        pi_path = shutil.which(self.pi_command)
        if pi_path is None:
            raise PiCliError(
                f"pi CLI not found in PATH. Please install pi or ensure it's accessible."
            )

    def run(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str | None = None,
        output_file: Path | None = None,
    ) -> PiResponse:
        """Run pi with prompts.
        
        Args:
            system_prompt: System prompt for the agent
            user_prompt: User prompt/input
            model: Optional model override
            output_file: Optional file to write output
            
        Returns:
            PiResponse with extracted text
            
        Raises:
            PiCliError: If pi execution fails
            SpecTimeoutError: If pi times out
        """
        # Build command
        cmd = [self.pi_command, "--mode", "json"]
        
        if model:
            cmd.extend(["--model", model])
        
        # Build combined prompt
        combined_prompt = f"{system_prompt}\n\n---\n\n{user_prompt}"
        
        try:
            # Run pi
            result = subprocess.run(
                cmd,
                input=combined_prompt,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                check=False,  # Don't raise on non-zero exit
            )
        except subprocess.TimeoutExpired:
            raise SpecTimeoutError("pi CLI", self.timeout)
        except FileNotFoundError:
            raise PiCliError(f"pi CLI not found: {self.pi_command}")
        except Exception as e:
            raise PiCliError(f"Failed to run pi CLI: {e}")
        
        # Check exit code
        if result.returncode != 0:
            raise PiCliError(
                f"pi CLI exited with code {result.returncode}",
                return_code=result.returncode,
                stderr=result.stderr,
            )
        
        # Parse JSONL output
        text = self._extract_text(result.stdout)
        
        # Write output if specified
        if output_file:
            output_file.write_text(result.stdout)
        
        # Try to parse JSON for raw data
        raw_json = None
        for line in result.stdout.strip().split("\n"):
            if line.strip():
                try:
                    raw_json = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue
        
        return PiResponse(
            text=text,
            raw_json=raw_json,
            exit_code=result.returncode,
        )

    def _extract_text(self, output: str) -> str:
        """Extract text from pi JSONL output.
        
        Args:
            output: Raw stdout from pi
            
        Returns:
            Extracted text content
        """
        # Try to find agent_end message
        for line in output.strip().split("\n"):
            if not line.strip():
                continue
            
            try:
                data = json.loads(line)
                
                # Look for agent_end type
                if data.get("type") == "agent_end":
                    messages = data.get("messages", [])
                    if messages:
                        last_message = messages[-1]
                        content = last_message.get("content", [])
                        if content and isinstance(content, list):
                            for item in content:
                                if item.get("type") == "text":
                                    return item.get("text", "")
            except json.JSONDecodeError:
                continue
        
        # Fallback: try grep + python extraction as in spec
        return self._extract_text_fallback(output)

    def _extract_text_fallback(self, output: str) -> str:
        """Fallback text extraction using grep pattern.
        
        This matches the extraction pattern from the spec.
        
        Args:
            output: Raw stdout from pi
            
        Returns:
            Extracted text content
        """
        import re
        
        # Look for the last message content
        pattern = r'"text":\s*"([^"]*(?:\\.[^"]*)*)"'
        matches = re.findall(pattern, output)
        
        if matches:
            # Return the last match
            text = matches[-1]
            # Unescape common sequences
            text = text.replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")
            return text
        
        # Last resort: return the whole output
        return output.strip()

    def validate_connection(self) -> bool:
        """Validate pi CLI is working.
        
        Returns:
            True if pi is accessible and responding
        """
        try:
            # Try a simple invocation
            result = subprocess.run(
                [self.pi_command, "--help"],
                capture_output=True,
                timeout=10,
            )
            return result.returncode == 0
        except Exception:
            return False


def check_pi_available() -> tuple[bool, str | None]:
    """Check if pi CLI is available.
    
    Returns:
        Tuple of (is_available, error_message)
    """
    try:
        client = PiClient()
        if client.validate_connection():
            return True, None
        return False, "pi CLI is not responding"
    except PiCliError as e:
        return False, str(e)
