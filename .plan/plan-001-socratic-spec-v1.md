# Implementation Plan: Socratic Spec v0.1.0

**Created**: 2026-04-28
**Objective**: Implement the two-agent spec refinement CLI tool from `socratic-spec-refiner.md`
**Version Target**: 0.1.0 (pre-alpha)

---

## Overview

A two-agent Q&A loop CLI tool that iteratively refines specifications through Socratic questioning. One agent (Interrogator) asks probing questions; the other (Respondee) answers. Session state is persisted to allow recovery from crashes.

### Design Decisions (Locked)
| Decision | Choice |
|----------|--------|
| Package name | `socratic_spec` |
| Entry point | `socratic-spec` CLI command |
| Package format | `pyproject.toml` (PEP 517/518) |
| Logging | Structured logging (verbose, both file + stdout) |
| Testing | pytest + hypothesis |
| Templates | Bundled + `--template-dir` override |
| Session dirs | New per run + `--resume <session-id>` |
| Config file | `~/.config/socratic_spec.toml` with CLI override |
| Error strategy | Graceful degradation (fallback parsers + warnings) |

---

## Context Summary

### Current State
- **Only**: `socratic-spec-refiner.md` specification document exists
- **No**: Implementation, tests, CI/CD, or packaging

### Key Dependencies
- Python 3.11+
- `pi` CLI in PATH (external, user-installed)
- Standard library only (no external Python deps)

### Constraints
- Single external dependency (`pi` CLI)
- No CI/CD for now (manual builds)
- Must support session recovery

---

## Phases

### Phase 1: Project Foundation
**Objective**: Set up the Python package structure, configuration, and basic scaffolding
**Dependencies**: None

#### Tasks

- [ ] **Initialize package structure**
  - **Files**: `src/socratic_spec/__init__.py`, `src/socratic_spec/py.typed`
  - **Action**: Create
  - **Details**: Package root with `__version__`, `__author__`, exports

- [ ] **Create `pyproject.toml`**
  - **Files**: `pyproject.toml`
  - **Action**: Create
  - **Details**: PEP 517/518 config, dependencies (pytest, hypothesis), entry points, classifiers

- [ ] **Create configuration module**
  - **Files**: `src/socratic_spec/config.py`
  - **Action**: Create
  - **Details**: Load config from `~/.config/socratic_spec.toml`, merge with CLI args, dataclass for settings

- [ ] **Create logging module**
  - **Files**: `src/socratic_spec/logging_config.py`
  - **Action**: Create
  - **Details**: Structured logging with JSON option, log levels, file + console handlers, context injection (session_id, round)

- [ ] **Create `.gitignore`**
  - **Files**: `.gitignore`
  - **Action**: Modify
  - **Details**: Add `__pycache__`, `.pytest_cache`, `*.egg-info`, `sessions/`

---

### Phase 2: Data Models & Types
**Objective**: Define core data structures with type hints
**Dependencies**: Phase 1

#### Tasks

- [ ] **Create data models module**
  - **Files**: `src/socratic_spec/models.py`
  - **Action**: Create
  - **Details**: Pydantic or dataclass models for:
    - `Turn` (round, type, content, timestamp)
    - `Session` (id, directory, created_at, state)
    - `Config` (all CLI options + config file values)
    - `InterrogatorOutput` (spec_draft, next_question)
    - `RespondeeOutput` (answer)

- [ ] **Create custom exceptions**
  - **Files**: `src/socratic_spec/exceptions.py`
  - **Action**: Create
  - **Details**: `SocraticSpecError`, `ParseError`, `PiCliError`, `SessionNotFoundError`, `TimeoutError`

- [ ] **Add type stubs for pi CLI**
  - **Files**: `src/socratic_spec/pi_types.py`
  - **Action**: Create
  - **Details**: Type definitions for pi JSONL output schema

---

### Phase 3: Template Management
**Objective**: Implement template loading with bundled defaults and override support
**Dependencies**: Phase 1

#### Tasks

- [ ] **Create bundled templates**
  - **Files**: `src/socratic_spec/templates/interrogator_system.txt`
  - **Action**: Create
  - **Details**: Copy from spec, add `{FEATURE_CONTEXT}` placeholder

- [ ] **Create bundled templates**
  - **Files**: `src/socratic_spec/templates/respondee_system.txt`
  - **Action**: Create
  - **Details**: Copy from spec

- [ ] **Create template loader**
  - **Files**: `src/socratic_spec/templates.py`
  - **Action**: Create
  - **Details**: Load from `--template-dir` if provided, fallback to bundled, validate placeholders

---

### Phase 4: Parsing Logic
**Objective**: Implement robust parsers with fallback strategies
**Dependencies**: Phase 2, Phase 3

#### Tasks

- [ ] **Create transcript parser**
  - **Files**: `src/socratic_spec/parsers/transcript.py`
  - **Action**: Create
  - **Details**: Parse JSONL, validate schema, handle corruption, yield `Turn` objects

- [ ] **Create interrogator output parser**
  - **Files**: `src/socratic_spec/parsers/interrogator.py`
  - **Action**: Create
  - **Details**: Parse `---RESPONDEE_REVIEW_ONLY---` delimiter, fallback regex matching

- [ ] **Create respondee output parser**
  - **Files**: `src/socratic_spec/parsers/respondee.py`
  - **Action**: Create
  - **Details**: Parse `[ANSWER]` section, fallback to full response

- [ ] **Create spec draft parser**
  - **Files**: `src/socratic_spec/parsers/spec_draft.py`
  - **Action**: Create
  - **Details**: Parse markdown spec sections, validate required fields, emit structured dict

- [ ] **Create parser registry**
  - **Files**: `src/socratic_spec/parsers/__init__.py`
  - **Action**: Create
  - **Details**: Export all parsers, combine into parser pipeline

---

### Phase 5: Session Management
**Objective**: Implement session lifecycle with recovery support
**Dependencies**: Phase 1, Phase 2

#### Tasks

- [ ] **Create session manager**
  - **Files**: `src/socratic_spec/session.py`
  - **Action**: Create
  - **Details**: Create/load sessions, directory management, state machine (PENDING → ACTIVE → COMPLETED/FAILED)

- [ ] **Implement session recovery**
  - **Files**: `src/socratic_spec/session.py`
  - **Action**: Modify
  - **Details**: Detect incomplete session from `transcript.jsonl`, resume from last round

- [ ] **Create session state utilities**
  - **Files**: `src/socratic_spec/session.py`
  - **Action**: Modify
  - **Details**: Get current round number, get last turn, validate session integrity

---

### Phase 6: pi CLI Integration
**Objective**: Implement robust pi subprocess management
**Dependencies**: Phase 1

#### Tasks

- [ ] **Create pi client wrapper**
  - **Files**: `src/socratic_spec/pi_client.py`
  - **Action**: Create
  - **Details**: Subprocess management, JSONL extraction, timeout handling, retry logic

- [ ] **Create agent runners**
  - **Files**: `src/socratic_spec/agents.py`
  - **Action**: Create
  - **Details**: `InterrogatorRunner`, `RespondeeRunner` with prompt building

- [ ] **Validate pi CLI availability**
  - **Files**: `src/socratic_spec/pi_client.py`
  - **Action**: Modify
  - **Details**: Check PATH on startup, clear error if missing

---

### Phase 7: Orchestrator Core
**Objective**: Implement the main Q&A loop orchestration
**Dependencies**: Phase 4, Phase 5, Phase 6

#### Tasks

- [ ] **Create orchestrator class**
  - **Files**: `src/socratic_spec/orchestrator.py`
  - **Action**: Create
  - **Details**: Main loop, round management, turn alternation, spec draft updating

- [ ] **Implement graceful shutdown**
  - **Files**: `src/socratic_spec/orchestrator.py`
  - **Action**: Modify
  - **Details**: Handle SIGINT/SIGTERM, save partial state, cleanup

- [ ] **Add max-rounds enforcement**
  - **Files**: `src/socratic_spec/orchestrator.py`
  - **Action**: Modify
  - **Details**: Check round limit, finalize spec gracefully if reached

- [ ] **Implement DONE detection**
  - **Files**: `src/socratic_spec/orchestrator.py`
  - **Action**: Modify
  - **Details**: Parse Interrogator output for "DONE", handle early completion

---

### Phase 8: CLI Interface
**Objective**: Build the command-line interface
**Dependencies**: Phase 1, Phase 7

#### Tasks

- [ ] **Create CLI entry point**
  - **Files**: `src/socratic_spec/cli.py`
  - **Action**: Create
  - **Details**: argparse with all flags, config file merging, validation

- [ ] **Create main function**
  - **Files**: `src/socratic_spec/cli.py`
  - **Action**: Modify
  - **Details**: Wire up orchestrator, config, logging, error handling

- [ ] **Add --resume functionality**
  - **Files**: `src/socratic_spec/cli.py`
  - **Action**: Modify
  - **Details**: Accept session ID, pass to orchestrator

- [ ] **Create shell completion**
  - **Files**: `src/socratic_spec/cli_completions.py`
  - **Action**: Create
  - **Details**: argcomplete support for bash/zsh/fish

---

### Phase 9: Testing Infrastructure
**Objective**: Comprehensive test suite
**Dependencies**: Phase 2, Phase 4

#### Tasks

- [ ] **Create conftest.py**
  - **Files**: `tests/conftest.py`
  - **Action**: Create
  - **Details**: pytest fixtures for config, temp sessions, mock pi responses

- [ ] **Test parsers with property-based testing**
  - **Files**: `tests/test_parsers.py`
  - **Action**: Create
  - **Details**: Hypothesis strategies for JSONL, markdown, invalid inputs; roundtrip tests

- [ ] **Test transcript parsing**
  - **Files**: `tests/test_transcript_parser.py`
  - **Action**: Create
  - **Details**: Valid/invalid JSONL, corruption recovery, empty file edge case

- [ ] **Test interrogator parser**
  - **Files**: `tests/test_interrogator_parser.py`
  - **Action**: Create
  - **Details**: Valid output, missing delimiter, empty sections, DONE detection

- [ ] **Test respondee parser**
  - **Files**: `tests/test_respondee_parser.py`
  - **Action**: Create
  - **Details**: Valid output, missing [ANSWER] tag, empty answer

- [ ] **Test session manager**
  - **Files**: `tests/test_session.py`
  - **Action**: Create
  - **Details**: Create, load, recover, list sessions

- [ ] **Test config loading**
  - **Files**: `tests/test_config.py`
  - **Action**: Create
  - **Details**: Config file, CLI override, validation, defaults

- [ ] **Integration test with mock pi**
  - **Files**: `tests/test_integration.py`
  - **Action**: Create
  - **Details**: Full orchestrator run with mocked pi subprocess

---

### Phase 10: Documentation
**Objective**: README and inline docs
**Dependencies**: Phase 8

#### Tasks

- [ ] **Create comprehensive README.md**
  - **Files**: `README.md`
  - **Action**: Create
  - **Details**: Installation, usage examples, CLI flags, config file format, exit codes

- [ ] **Add docstrings to public APIs**
  - **Files**: `src/socratic_spec/__init__.py`, `src/socratic_spec/config.py`, etc.
  - **Action**: Modify
  - **Details**: Google-style or numpy docstrings for all public functions/classes

- [ ] **Create example session**
  - **Files**: `examples/example-session.md`
  - **Action**: Create
  - **Details**: Show sample Q&A dialogue and resulting spec

---

### Phase 11: Package Verification
**Objective**: Verify the package installs and runs correctly
**Dependencies**: Phase 10

#### Tasks

- [ ] **Test pip install in venv**
  - **Action**: Run
  - **Details**: `python -m venv /tmp/test_venv && source /tmp/test_venv/bin/activate && pip install -e . && socratic-spec --help`

- [ ] **Test end-to-end with real pi**
  - **Action**: Run
  - **Details**: `socratic-spec --context "A web server that serves static files" --project-name "StaticServer"`

- [ ] **Verify session recovery**
  - **Action**: Run
  - **Details**: Interrupt a session, resume with `--resume`, verify continuity

- [ ] **Verify template override**
  - **Action**: Run
  - **Details**: `socratic-spec --template-dir ./custom-templates ...`, verify custom templates used

---

## File Manifest

### New Files to Create

| Action | Path | Description |
|--------|------|-------------|
| Create | `src/socratic_spec/__init__.py` | Package init with version |
| Create | `src/socratic_spec/py.typed` | PEP 561 type marker |
| Create | `src/socratic_spec/config.py` | Configuration loading |
| Create | `src/socratic_spec/logging_config.py` | Structured logging setup |
| Create | `src/socratic_spec/models.py` | Data models |
| Create | `src/socratic_spec/exceptions.py` | Custom exceptions |
| Create | `src/socratic_spec/pi_types.py` | pi CLI type stubs |
| Create | `src/socratic_spec/templates.py` | Template loader |
| Create | `src/socratic_spec/templates/interrogator_system.txt` | Interrogator prompt |
| Create | `src/socratic_spec/templates/respondee_system.txt` | Respondee prompt |
| Create | `src/socratic_spec/parsers/__init__.py` | Parser exports |
| Create | `src/socratic_spec/parsers/transcript.py` | JSONL transcript parser |
| Create | `src/socratic_spec/parsers/interrogator.py` | Interrogator output parser |
| Create | `src/socratic_spec/parsers/respondee.py` | Respondee output parser |
| Create | `src/socratic_spec/parsers/spec_draft.py` | Spec draft parser |
| Create | `src/socratic_spec/session.py` | Session management |
| Create | `src/socratic_spec/pi_client.py` | pi CLI wrapper |
| Create | `src/socratic_spec/agents.py` | Agent runners |
| Create | `src/socratic_spec/orchestrator.py` | Main orchestration |
| Create | `src/socratic_spec/cli.py` | CLI interface |
| Create | `src/socratic_spec/cli_completions.py` | Shell completions |
| Create | `pyproject.toml` | Package configuration |
| Create | `tests/__init__.py` | Test package init |
| Create | `tests/conftest.py` | pytest fixtures |
| Create | `tests/test_parsers.py` | Parser tests + hypothesis |
| Create | `tests/test_transcript_parser.py` | Transcript tests |
| Create | `tests/test_interrogator_parser.py` | Interrogator tests |
| Create | `tests/test_respondee_parser.py` | Respondee tests |
| Create | `tests/test_session.py` | Session tests |
| Create | `tests/test_config.py` | Config tests |
| Create | `tests/test_integration.py` | Integration tests |
| Create | `README.md` | Documentation |
| Create | `examples/example-session.md` | Example session |

### Files to Modify

| Action | Path | Description |
|--------|------|-------------|
| Modify | `.gitignore` | Add Python/package patterns |
| Modify | `.gitignore` | Add `sessions/`, logs |

---

## Success Criteria

- [ ] `pip install -e .` succeeds
- [ ] `socratic-spec --help` shows all flags
- [ ] `socratic-spec --context <file> --project-name Test` creates session directory
- [ ] Full Q&A loop executes with mocked pi CLI
- [ ] `transcript.jsonl` contains all turns
- [ ] `final_spec.md` contains valid spec format
- [ ] `--resume` recovers from interrupted session
- [ ] All pytest tests pass (including hypothesis)
- [ ] Type checking passes (`mypy src/`)
- [ ] README.md has clear installation and usage docs

---

## Potential Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pi CLI response format differs from spec | Medium | High | Implement robust fallback parsers, log warnings |
| Template placeholder collisions | Low | Medium | Use unique delimiters, validate templates on load |
| Session corruption during write | Low | High | Write to temp file, atomic rename |
| Infinite loops (pi always returns question) | Low | Medium | max-rounds limit already in spec |
| Config file format errors | Low | Low | Validate on load, provide defaults, clear errors |

---

## Implementation Order Summary

```
Phase 1: Foundation (pyproject.toml, config, logging)
    ↓
Phase 2: Data Models (types, exceptions)
    ↓
Phase 3: Templates (bundled + loader)
    ↓
Phase 4: Parsers (robust with fallbacks)
    ↓
Phase 5: Session Management (recovery support)
    ↓
Phase 6: pi CLI Integration (subprocess wrapper)
    ↓
Phase 7: Orchestrator (main loop)
    ↓
Phase 8: CLI (entry point, --resume)
    ↓
Phase 9: Testing (pytest + hypothesis)
    ↓
Phase 10: Documentation (README, docstrings)
    ↓
Phase 11: Verification (install + e2e test)
```

---

*Plan created from comprehensive project study. Decisions documented above are final.*
