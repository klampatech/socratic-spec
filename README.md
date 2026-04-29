# Socratic Spec

**A Two-Agent Specification Refinement Tool**

A CLI tool that uses AI agents in a structured Q&A dialogue to iteratively refine software specifications. The **Interrogator** agent asks probing questions to uncover edge cases and ambiguities, while the **Respondee** agent answers based on provided context.

## Installation

```bash
# Clone the repository
git clone https://github.com/kylelampa/socratic-spec.git
cd socratic-spec

# Install in development mode
pip install -e .

# Install with dev dependencies
pip install -e ".[dev]"
```

## Requirements

- Python 3.11+
- `pi` CLI in PATH ([Install pi](https://github.com/mariozechner/pi-coding-agent))

## Quick Start

```bash
# Option 1: Plain text context (easiest!)
socratic-spec --context "Build a web server" --project-name "WebServer"

# Option 2: File-based context
socratic-spec --context ./path/to/spec.md --project-name "MyProject"
```

## Usage

```
socratic-spec [OPTIONS]

Options:
  -c, --context TEXT             Path to context file OR plain text description  [required]
  -p, --project-name TEXT         Name for the project (default: project)
  -r, --max-rounds INTEGER        Maximum number of Q&A rounds (default: 50)
  -o, --output PATH               Output directory for sessions (default: sessions/)
  -m, --model TEXT                Model override for both agents
  --interrogator-model TEXT       Model for Interrogator agent
  --respondee-model TEXT          Model for Respondee agent
  --template-dir PATH             Directory with custom templates
  --resume TEXT                   Resume from existing session ID
  --log-level [debug|info|warning|error]
                                  Logging level (default: INFO)
  --log-json / --no-log-json      Use JSON logging format
  --help                          Show this message and exit.
```

## Configuration

Create `~/.config/socratic_spec.toml` for default settings:

```toml
[settings]
max_rounds = 50
output_dir = "./sessions"
log_level = "INFO"
log_json = false
```

## How It Works

1. **Initialize**: Create a session with your project context
2. **Interrogator**: Asks probing questions about requirements
3. **Respondee**: Provides answers based on your context
4. **Iterate**: Continue until Interrogator signals DONE
5. **Output**: Get a comprehensive `final_spec.md`

## Session Directory

Sessions are stored in timestamped directories:

```
sessions/
└── 2026-04-28_143021/
    ├── transcript.jsonl    # Full Q&A audit trail
    ├── spec_draft.md       # Intermediate spec drafts
    ├── final_spec.md       # Final specification
    └── session.json        # Session metadata
```

## Resume Session

If interrupted, resume with the session ID:

```bash
socratic-spec --resume 2026-04-28_143021 --context context.md
```

## Custom Templates

Use your own agent prompts:

```bash
socratic-spec --context context.md --template-dir ./custom-templates
```

Required templates:
- `interrogator_system.txt`
- `respondee_system.txt`

## Development

```bash
# Run tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=socratic_spec --cov-report=html

# Lint
ruff check src/

# Type check
mypy src/
```

## License

MIT License - see LICENSE file for details.
