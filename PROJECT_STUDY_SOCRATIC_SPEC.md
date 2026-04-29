# Project Study: Socratic Spec

**Project**: Socratic Spec - A Two-Agent Specification Refinement Tool  
**Study Date**: 2026-04-28  
**Version**: Pre-Implementation (In Development)

---

## Executive Summary

Socratic Spec is a local CLI tool that uses two AI agents in a structured Q&A dialogue to iteratively refine software specifications. The **Interrogator** agent asks probing questions to uncover edge cases and ambiguities, while the **Respondee** agent answers based on provided context, resulting in a comprehensive `final_spec.md` document. The tool is a single-process Python application using the `pi` CLI for agent communication, file-backed state management, and the standard library only—no external dependencies beyond Python itself.

**Key Characteristics:**
- Zero authentication overhead (local CLI tool)
- Minimal dependencies (Python 3.11+ and standard library)
- JSONL-based audit trail for compliance and debugging
- Sequential agent orchestration with 5-minute turn timeout
- Pre-production stage with incomplete testing infrastructure

---

## Technical Architecture

### System Design

Socratic Spec follows a **single-process CLI orchestration pattern** with clear separation between the controller logic and AI agent execution.

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Interface                          │
│                   (argparse + main())                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Orchestrator (orchestrator.py)            │
│  • Round management                                          │
│  • Turn alternation (Interrogator ↔ Respondee)               │
│  • Response parsing                                          │
│  • Timeout enforcement (5 min/turn)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
┌─────────────────────────┐ ┌─────────────────────────────┐
│   Interrogator Agent    │ │     Respondee Agent          │
│   (pi --mode json)       │ │     (pi --mode json)         │
│   - Probing questions    │ │     - Contextual answers    │
│   - Edge case discovery  │ │     - No memory (stateless)  │
└─────────────────────────┘ └─────────────────────────────┘
              │                       │
              └───────────┬───────────┘
                          ▼
              ┌─────────────────────────┐
              │   Session Directory     │
              │  (YYYY-MM-DD_HHMMSS/)   │
              ├─────────────────────────┤
              │ • transcript.jsonl      │
              │ • spec_draft.md         │
              │ • final_spec.md         │
              └─────────────────────────┘
```

### Core Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Entry Point | `cli.py` | Argument parsing, environment validation |
| Orchestration | `orchestrator.py` | Round management, agent coordination, parsing |
| Templates | `templates/` | System prompts for Interrogator and Respondee |
| Documentation | `README.md` | Usage instructions, examples |

### Design Patterns

1. **Strict Alternation Pattern**: Turns strictly alternate between Interrogator and Respondee, reducing state complexity
2. **Stateless Respondee**: Respondee agent receives full context each turn, eliminating memory management
3. **Fallback Parsing**: Multiple parser strategies (grep + Python extraction) ensure robustness
4. **File-Backed State**: All state persisted to JSONL for auditability and recovery

---

## Data Layer

### Session Storage Structure

Sessions are stored in timestamped directories under `sessions/`:

```
sessions/
└── 2026-04-28_143052/          ← Timestamp of session start
    ├── transcript.jsonl         ← Complete audit trail
    ├── spec_draft.md             ← Intermediate spec state
    └── final_spec.md             ← Final output document
```

### Transcript Schema (JSONL)

Each line in `transcript.jsonl` represents one agent exchange:

```json
{
  "round": 1,
  "type": "question",           // "question" | "answer" | "system"
  "content": "Agent response text...",
  "timestamp": "2026-04-28T14:30:52Z"
}
```

### Specification Document Format

The output `final_spec.md` follows a structured template:

```markdown
# [Project Name] Specification

## Outcome
[What success looks like]

## Given Preconditions
[Required state before the feature works]

## When Trigger
[The action or event that activates the feature]

## Then Expectations
[Expected outcomes and behaviors]

## Failure Modes
[Known failure scenarios and their handling]
```

### Data Flow

1. **Initialization**: Create session directory, write initial spec_draft.md
2. **Each Round**:
   - Interrogator produces question → append to transcript.jsonl
   - Respondee produces answer → append to transcript.jsonl
   - Orchestrator updates spec_draft.md
3. **Termination**: Finalize spec_draft.md → rename to final_spec.md

---

## API & Integrations

### CLI Interface

```bash
socratic-spec [OPTIONS]

Options:
  --context PATH              Initial context file (required)
  --project-name TEXT         Project name for output header
  --max-rounds INTEGER        Maximum rounds (default: 50)
  --output DIR               Output directory (default: sessions/)
  --model TEXT               Override Respondee model
  --interrogator-model TEXT  Override Interrogator model
  --respondee-model TEXT     Override Respondee model
```

### pi CLI Integration

The tool integrates with `pi` (a coding agent harness) for agent communication:

```bash
pi --mode json --system-prompt "<prompt>" --user-prompt "<input>"
```

**Integration Points:**
- Both agents use identical `pi --mode json` invocation
- Response parsing via grep for JSON delimiters + Python extraction
- Clean process boundary between orchestrator and agent processes

### External Dependencies on APIs

| Dependency | Purpose | Interface |
|------------|---------|-----------|
| `pi` CLI | Agent execution | Subprocess invocation |
| File System | State persistence | Standard library (pathlib) |

---

## Security & Authentication

### Security Posture

| Aspect | Status | Notes |
|--------|--------|-------|
| Authentication | Not Required | Local CLI tool |
| Authorization | Not Required | Single user context |
| Credential Handling | None | No secrets stored |
| Secrets Management | N/A | No external services |

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM-generated sensitive content | **Low** | Content scoped to provided context |
| Session directory permissions | **Low** | Standard filesystem permissions |
| Command injection via context | **Low** | Context is file-based, not shell-evaluated |
| Session data exposure | **Medium** | User responsibility for directory access |

### Privacy Considerations

- All data remains local on the user's filesystem
- No telemetry or external data transmission
- Session transcripts may contain project-sensitive information
- User controls output directory placement

---

## Testing & Quality

### Current Testing Status

| Test Type | Status | Coverage |
|-----------|--------|----------|
| Unit Tests | **Not Implemented** | 0% |
| Integration Tests | **Not Implemented** | 0% |
| E2E Tests | **Not Implemented** | 0% |

### Planned Testing Infrastructure

1. **Unit Tests for Parsers**
   - JSONL transcript parsing
   - Markdown spec generation
   - CLI argument validation

2. **Integration Tests**
   - Real `pi` agent invocation
   - Full round-trip specification refinement
   - Session recovery from partial transcripts

### Error Handling Strategy

The specification defines fallback parsers for robustness:

```
Primary Parser → Fallback Parser → Error Message
     │                │                  │
     ▼                ▼                  ▼
   (tries)         (tries)          (graceful failure)
```

### Quality Gaps

| Gap | Priority | Effort |
|-----|----------|--------|
| No unit tests | High | Medium |
| No integration tests | High | High |
| No CI/CD pipeline | Medium | Medium |
| No type hints | Low | Medium |

---

## Deployment & DevOps

### Current State

| Aspect | Status |
|--------|--------|
| Package Distribution | Not created |
| CI/CD Pipeline | Not configured |
| Containerization | Not applicable |
| Environment Config | Not required |

### Distribution Considerations

**Advantages of Current Approach:**
- Single Python file distribution possible
- No build step required
- Pure standard library = no dependency hell
- `pip install -e .` for development mode

**Recommended Package Structure (if created):**
```
socratic-spec/
├── socratic_spec/
│   ├── __init__.py
│   ├── cli.py
│   ├── orchestrator.py
│   └── templates/
│       ├── interrogator.md
│       └── respondee.md
├── tests/
├── pyproject.toml
└── README.md
```

### Installation Requirements

```bash
# Required
python3.11+
pi CLI in PATH

# Optional (for development)
pip install -e .
```

---

## Dependencies

### Dependency Analysis

| Category | Dependency | Version | Purpose |
|----------|------------|---------|---------|
| Runtime | Python | 3.11+ | Execution environment |
| Runtime | pi CLI | Latest | Agent communication |
| Build | (none) | - | N/A |
| Dev | (none) | - | N/A |

### Standard Library Modules Used

```python
import json          # JSONL parsing/serialization
import subprocess     # pi CLI invocation
import pathlib        # Path manipulation
import argparse       # CLI argument parsing
import datetime       # Timestamp generation
import re             # Response parsing
```

### Dependency Graph

```
socratic-spec
└── Python 3.11+ (standard library only)
    ├── json
    ├── subprocess
    ├── pathlib
    ├── argparse
    ├── datetime
    └── re
        └── pi CLI (external binary)
```

### Philosophy

Minimal dependencies reduce:
- Security attack surface
- Compatibility issues
- Distribution complexity
- Maintenance burden

---

## Code Quality

### Strengths

1. **Well-Structured Specification**: Clear, detailed spec with error handling defined
2. **Clean Error Handling**: Fallback parser strategy prevents single points of failure
3. **Reduced Complexity**: Strict alternation pattern simplifies state management
4. **Stateless Design**: Respondee simplicity aids debugging and reasoning
5. **Parser Validation**: Heuristics in place for response parsing

### Identified Quality Concerns

| Concern | Impact | Remediation |
|---------|--------|-------------|
| No type hints | Maintainability | Add PEP 484 annotations |
| No linting configuration | Consistency | Add ruff/flake8 config |
| No formatting standard | Readability | Add black/isort config |
| No docstrings | Discoverability | Add docstrings to public APIs |

### Code Style Recommendations

```python
# Current: Likely follows PEP 8
# Recommended additions:
- Type hints for all function signatures
- docstrings for public modules/functions
- Consistent error message format
- Logging instead of print statements
```

### Static Analysis Opportunities

```bash
# Recommended tools when implemented
ruff check .           # Linting
mypy .                 # Type checking
black --check .        # Formatting
```

---

## User Experience

### CLI Interface Quality

**Strengths:**
- Clean, intuitive flag naming
- Sensible defaults (50 max rounds, sessions/ output)
- Clear required arguments (--context)
- Good flag documentation in specification

**Areas for Enhancement:**
| Enhancement | Priority | Complexity |
|-------------|----------|------------|
| Progress indicators | Medium | Low |
| Streaming output | Medium | Medium |
| Interactive spec preview | Low | Medium |
| Colorized terminal output | Low | Low |

### User Workflow

```
1. User prepares context file (initial requirements, existing docs)
2. User runs: socratic-spec --context requirements.txt --project-name "MyApp"
3. Tool creates session directory with timestamp
4. Tool orchestrates Q&A dialogue (user observes progress)
5. Tool produces final_spec.md upon completion or timeout
```

### Output Auditability

- **transcript.jsonl**: Complete conversation history for compliance/debugging
- **spec_draft.md**: Evolution of specification across rounds
- **final_spec.md**: Deliverable specification document

### Error Messages (Defined in Spec)

| Scenario | Message |
|----------|---------|
| Invalid context file | "Error: Context file not found or unreadable" |
| pi CLI missing | "Error: pi CLI not found in PATH" |
| Parse failure | "Warning: Could not parse response, using fallback" |
| Timeout | "Warning: Turn {n} timed out after 300s" |

---

## Performance & Optimization

### Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Parallelization | None | Sequential agent calls |
| Turn Timeout | 300s (5 min) | Configurable implicitly |
| Max Rounds | 50 | Default limit |
| Memory Footprint | Minimal | Single process per turn |
| Disk I/O | Per-round | JSONL append, spec write |

### Bottleneck Analysis

```
Primary Bottleneck: pi response latency
├── Network (if using remote model)
├── Model inference time
└── Context window size

Secondary: Subprocess overhead
└── Process spawn per turn
```

### Resource Management

| Resource | Management | Status |
|----------|------------|--------|
| File handles | Closed per operation | ✓ Good |
| Process lifecycle | Spawned per turn, terminated after | ✓ Good |
| Memory | Single orchestrator process | ✓ Good |
| Disk space | JSONL grows with rounds | ⚠ Monitor |

### Optimization Opportunities

| Optimization | Impact | Effort |
|--------------|--------|--------|
| Streaming responses | UX improvement | Medium |
| Parallel initial context processing | Latency | Medium |
| Lazy spec drafting | I/O reduction | Low |
| Session resume capability | UX improvement | Medium |

### Scaling Considerations

**What Scales Well:**
- More complex specifications (more rounds)
- Larger context files
- Longer conversations

**What Doesn't Scale Well:**
- Multiple concurrent sessions (manual orchestration)
- Very large context files (pi CLI context limit)
- Real-time collaboration (single-user design)

---

## Key Insights & Recommendations

### Strategic Insights

1. **Minimalist Architecture Pays Off**
   The decision to use only standard library and a single external tool (pi) dramatically reduces maintenance burden and distribution complexity.

2. **Audit Trail Design is Robust**
   JSONL transcript + markdown spec combination provides both machine-parseable history and human-readable output.

3. **Stateless Respondee is a Smart Trade-off**
   Forcing the Respondee to be stateless simplifies agent prompts and reduces context window pressure.

4. **Pre-Production State is Appropriate**
   The project is appropriately scoped for its development stage—no premature infrastructure.

### Critical Recommendations

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| **High** | Implement unit tests for parsers | Prevent parsing regressions |
| **High** | Add type hints | Improve maintainability |
| **High** | Configure CI/CD | Prevent quality regressions |
| **Medium** | Add progress indicators | UX parity with modern CLIs |
| **Medium** | Create pyproject.toml | Enable standard Python packaging |
| **Medium** | Add logging | Operational debugging |
| **Low** | Streaming output | Future enhancement |

### Technical Debt Inventory

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Missing unit tests | High | Medium | Fix soon |
| Missing type hints | Medium | Medium | Technical debt |
| No CI/CD | Medium | Medium | Technical debt |
| No linting config | Low | Low | Quick win |
| No docstrings | Low | Low | Quick win |

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pi CLI API changes | Low | High | Version pinning, error handling |
| Context file too large | Medium | Medium | Document limits, early warning |
| Infinite conversation loop | Low | Medium | Round limit (50 default) |
| Parse failures cascade | Low | Medium | Fallback parsers already designed |

---

## Glossary

| Term | Definition |
|------|------------|
| **Interrogator Agent** | The AI agent that asks probing questions to uncover edge cases |
| **Respondee Agent** | The AI agent that answers questions based on provided context |
| **Session** | A complete Q&A dialogue from start to termination |
| **Round** | One complete exchange: Interrogator question + Respondee answer |
| **Turn** | Either the Interrogator or Respondee speaking (one half of a round) |
| **Transcript** | The JSONL audit trail of all agent exchanges |
| **Spec Draft** | The evolving markdown specification document |
| **Final Spec** | The completed specification document |
| **pi** | A coding agent harness CLI tool used for agent execution |
| **JSONL** | JSON Lines - newline-delimited JSON format for streaming |
| **Orchestrator** | The Python module that coordinates agent interactions |

---

## Questions & Knowledge Gaps

1. **What is the exact pi CLI response format?** The spec mentions JSON extraction via grep but the exact response schema isn't documented.

2. **Are there any known pi CLI timeout scenarios?** Beyond the 5-minute turn timeout, are there other failure modes?

3. **What is the maximum recommended context file size?** Practical limits for the pi CLI context window.

4. **How does the project handle pi CLI installation?** Is there a setup script or documentation for users?

5. **What termination conditions exist beyond max-rounds?** Is there a "spec complete" signal or only round limits?

---

## Appendix: File Inventory

| File/Directory | Purpose |
|----------------|---------|
| `cli.py` | CLI entry point with argparse |
| `orchestrator.py` | Core orchestration logic |
| `templates/` | Agent system prompts |
| `templates/interrogator.md` | Interrogator agent prompt template |
| `templates/respondee.md` | Respondee agent prompt template |
| `README.md` | User documentation |
| `SPEC.md` | Project specification (this document's source) |
| `sessions/` | Default output directory for session data |

---

*Study synthesized from 10 specialized exploration agents. For questions about this document, refer to SPEC.md or README.md in the project root.*
