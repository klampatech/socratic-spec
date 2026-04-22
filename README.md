# Socratic Spec Refiner

A two-agent Q&A loop that iteratively refines a specification by forcing explicit articulation of every decision through interrogation.

## Concept

One agent (Interrogator) asks probing questions; the other (Respondee) answers. After each answer, the Interrogator synthesizes it into a growing spec draft and fires the next question. Loop until the Interrogator has nothing left to ask.

The goal is ghost requirements and hidden assumptions — the stuff that makes specs break in implementation — to surface during speccing rather than during development.

## Design Principles

1. **Strict alternation** — one question, one answer, repeat. No batching.
2. **Stateless Respondee** — each answer is independent, no memory of prior Q&A beyond what the Interrogator feeds it
3. **Interrogator owns the spec draft** — builds it question by question, answer by answer
4. **pi JSON mode** — `pi --mode json` for clean event extraction, no TUI, no interactivity
5. **File-backed conversation** — JSONL transcript for audit trail, human-readable spec output
6. **Zero pi modification** — shell-pipe architecture, no extensions required

## Quick Start

```bash
# Install pi if needed
# Ensure pi is in PATH

# Run a spec refinement session
socratic-spec-refiner --context "users should be able to authenticate via OAuth"

# Or use shorthand
socratic-spec "users should be able to authenticate via OAuth"
```

## Architecture

```
socratic-spec-refiner
├── orchestrator.py        # Main loop, file I/O, pi process management
├── templates/
│   ├── interrogator_system.txt   # Interrogator system prompt template
│   └── respondee_system.txt     # Respondee system prompt template
└── README.md
```

## Output

Each run creates a timestamped session directory:

```
sessions/2026-04-22_143021/
├── transcript.jsonl    # Full Q&A log (all rounds)
├── spec_draft.md       # Current spec draft (overwritten each round)
└── final_spec.md      # Final output when Interrogator signals done
```

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--context` | **required** | High-level project description or question framing |
| `--project-name` | `"project"` | Name for spec file headings |
| `--max-rounds` | `50` | Safety cap to prevent infinite loops |
| `--output` | `./sessions/` | Session output directory |
| `--model` | (pi default) | Override model for both agents |

## Dependencies

- Python 3.11+
- `pi` CLI in PATH
