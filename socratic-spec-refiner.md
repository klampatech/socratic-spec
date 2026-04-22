# Socratic Spec Refiner

**Date:** 2026-04-22
**Status:** Draft
**Type:** Specification

---

## 1. Concept & Vision

A two-agent Q&A loop that iteratively refines a spec by forcing explicit articulation of every decision through interrogation. One agent (Interrogator) asks probing questions; the other (Respondee) answers. After each answer, the Interrogator synthesizes it into a growing spec draft and fires the next question. Loop until the Interrogator has nothing left to ask.

The goal is ghost requirements and hidden assumptions — the stuff that makes specs break in implementation — to surface during speccing rather than during development.

---

## 2. Design Principles

1. **Strict alternation** — one question, one answer, repeat. No batching.
2. **Stateless Respondee** — each answer is independent, no memory of prior Q&A beyond what the Interrogator feeds it
3. **Interrogator owns the spec draft** — builds it question by question, answer by answer
4. **pi JSON mode** — `pi --mode json` for clean event extraction, no TUI, no interactivity
5. **File-backed conversation** — JSONL transcript for audit trail, human-readable spec output
6. **Zero pi modification** — shell-pipe architecture, no extensions required

---

## 3. System Prompts

### Interrogator

```
You are an interrogator. Your only job is to ask probing questions that expose gaps, challenge assumptions, and force articulation of edge cases in a software project. You do not design. You do not write code. You do not produce solutions. You only ask questions.

After each answer, you must:
1. Synthesize the answer into the growing spec draft
2. Ask your next question based on the updated draft

Stop when you genuinely have nothing left to ask. Do not exit early out of politeness.

OUTPUT FORMAT:
After each answer, output your response as TWO sections separated by "---RESPONDEE_REVIEW_ONLY---":

[SYNTHESIZED SPEC DRAFT]
<current spec draft in markdown, updated with latest answer>

---RESPONDEE_REVIEW_ONLY---

[NEXT QUESTION]
<your next question, or "DONE" if you have nothing left to ask>
```

### Respondee

```
You are a subject matter expert being interviewed. Answer questions directly, specifically, and with technical precision. Do not ramble. Do not hedge unnecessarily. When you don't know something, say so clearly. When an answer involves assumptions, state them explicitly.

OUTPUT FORMAT:
[ANSWER]
<your direct, precise answer>
```

---

## 4. Architecture

### Single-Process Orchestration

```
socratic-spec-refiner
├── orchestrator.py        # Main loop, file I/O, pi process management
├── templates/
│   ├── interrogator_system.txt   # Interrogator system prompt template
│   └── respondee_system.txt     # Respondee system prompt template
└── README.md
```

Single `socratic-spec-refiner` CLI. No daemon, no subprocess pool — one Interrogator pi, one Respondee pi, managed sequentially.

---

## 5. Conversation Protocol

### File-Backed State

Each run creates a timestamped session directory:

```
sessions/
└── 2026-04-22_143021/
    ├── transcript.jsonl    # Full Q&A log (all rounds)
    ├── spec_draft.md       # Current spec draft (overwritten each round)
    └── final_spec.md       # Final output when Interrogator signals done
```

**`transcript.jsonl` format — one entry per turn:**

```jsonl
{"round": 1, "type": "question", "content": "How should users authenticate?", "timestamp": "..."}
{"round": 1, "type": "answer", "content": "Users authenticate via OAuth 2.0 with GitHub as the primary provider...", "timestamp": "..."}
{"round": 2, "type": "question", "content": "What happens when the OAuth provider is down?", "timestamp": "..."}
{"round": 2, "type": "answer", "content": "...", "timestamp": "..."}
```

### Spec Draft Format

The spec draft is written by the Interrogator after each answer. Format:

```markdown
# [Project Name]

## Outcome
One sentence describing what this project achieves.

## Given Preconditions
- ...

## When Trigger
...

## Then Expectations
- ...

## Failure Modes
- F1: ...

## Open Questions (for Interrogator to pursue)
- ...
```

---

## 6. Main Loop

```
INPUT: feature_context (user-provided high-level project description)

1. Create session directory
2. Write initial spec_draft.md (empty skeleton)

3. ROUND 1:
   a. Build Interrogator prompt:
      - Interrogator system prompt
      - FEATURE_CONTEXT
      - "This is your first question — start by asking about the most critical unknown."

   b. Run: pi --mode json "[Interrogator prompt]"
   c. Extract response from agent_end.messages[-1]
   d. Parse: split on "---RESPONDEE_REVIEW_ONLY---"
      - First part = updated spec draft → write to spec_draft.md
      - Second part = next question

4. IF next question == "DONE":
   a. Copy spec_draft.md → final_spec.md
   b. Output: "Interrogator has no more questions. Spec complete."
   c. Exit

5. ELSE:
   a. Build Respondee prompt:
      - Respondee system prompt
      - Next question only

   b. Run: pi --mode json "[Respondee prompt]"
   c. Extract answer from agent_end.messages[-1]
   d. Append Q&A to transcript.jsonl

6. GOTO 3a (next round)
```

---

## 7. pi JSON Mode Extraction

Each `pi --mode json` invocation outputs JSONL. We care about:

- `session` header line — validate version, session ID
- `agent_end` — final event, contains `messages` array
- Final text: `messages[messages.length - 1].content[0].text`

```
pi --mode json "..." 2>/dev/null | grep '"type":"agent_end"' | python -c "
import json, sys
for line in sys.stdin:
    event = json.loads(line)
    if event['type'] == 'agent_end':
        msgs = event['messages']
        last = msgs[-1]
        text = last['content'][0]['text']
        print(text, end='')
"
```

Exit on non-zero return code from pi = failure.

---

## 8. CLI Interface

```bash
socratic-spec-refiner --context "High-level project description"
                     [--project-name "My Project"]
                     [--max-rounds 50]
                     [--output ./specs/]
                     [--model anthropic:claude-sonnet-4-5]

# Shorthand
socratic-spec "users should be able to authenticate via OAuth"
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--context` | **required** | High-level project description or question framing |
| `--project-name` | `"project"` | Name for spec file headings |
| `--max-rounds` | `50` | Safety cap to prevent infinite loops |
| `--output` | `./sessions/` | Session output directory |
| `--model` | (pi default) | Override model for both agents |
| `--interrogator-model` | (uses `--model`) | Separate model for Interrogator |
| `--respondee-model` | (uses `--model`) | Separate model for Respondee |

---

## 9. Prompt Templates (Stored)

### `templates/interrogator_system.txt`

```
You are an interrogator. Your only job is to ask probing questions that expose gaps, challenge assumptions, and force articulation of edge cases in a software project. You do not design. You do not write code. You do not produce solutions. You only ask questions.

The project under discussion: {FEATURE_CONTEXT}

After each answer, you must:
1. Synthesize the answer into the growing spec draft
2. Ask your next question based on the updated draft

Stop when you genuinely have nothing left to ask. Do not exit early out of politeness.

OUTPUT FORMAT:
After each answer, output your response as TWO sections separated by the literal delimiter "---RESPONDEE_REVIEW_ONLY---":

First line: "[SYNTHESIZED SPEC DRAFT]" (exactly, no quotes)
All lines until the delimiter: your updated spec draft in markdown

Line after delimiter: "[NEXT QUESTION]" (exactly, no quotes)
Remaining lines: your next question, OR the single word "DONE" if you have nothing left to ask.

Example output:
[SYNTHESIZED SPEC DRAFT]
# Project Auth

## Outcome
Users authenticate via OAuth 2.0.

## Given Preconditions
- User has a GitHub account

## When Trigger
User clicks "Sign in with GitHub"

## Then Expectations
- OAuth flow initiates
- On success, user record created/updated

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
What happens when the OAuth provider is unavailable?
```

### `templates/respondee_system.txt`

```
You are a subject matter expert being interviewed. Answer questions directly, specifically, and with technical precision. Do not ramble. Do not hedge unnecessarily. When you don't know something, say so clearly. When an answer involves assumptions, state them explicitly.

OUTPUT FORMAT:
First line: "[ANSWER]" (exactly, no quotes)
Remaining lines: your direct, precise answer.

Example output:
[ANSWER]
The system falls back to a local email/password authentication method if OAuth is unavailable. This requires the user to have previously set up a backup password in their account settings.
```

---

## 10. Error Handling

| Scenario | Handling |
|----------|----------|
| pi exits non-zero | Log error, write current spec draft to `spec_draft.md`, exit 1 |
| pi JSONL parse fails | Retry once, then fail |
| pi times out (>5 min per turn) | Treat as non-zero exit, log |
| Interrogator output format invalid | Log warning, attempt to extract question anyway, continue |
| Respondee output format invalid | Log warning, treat entire output as answer, continue |
| `DONE` on round 1 | Spec was trivial, write skeleton to final_spec.md |
| Max rounds reached | Write current spec draft to final_spec.md, log "max rounds reached" |

---

## 11. Validation Heuristics

**Interrogator output parsing:**

```
Expected: [SYNTHESIZED SPEC DRAFT] + content + "---RESPONDEE_REVIEW_ONLY---" + [NEXT QUESTION] + content or DONE
Fallback: If delimiter not found, treat entire response as spec draft, ask "Any follow-up questions?" as next question
```

**Respondee output parsing:**

```
Expected: [ANSWER] + content
Fallback: If [ANSWER] not found, treat entire response as the answer
```

---

## 12. Output Artifacts

After a complete run:

```
sessions/2026-04-22_143021/
├── transcript.jsonl    # Full Q&A log
├── spec_draft.md       # Last intermediate draft (may == final_spec.md)
└── final_spec.md      # Delivered spec
```

---

## 13. Example Session

### Round 1

**Interrogator prompt (built):**
```
[Interrogator system prompt]
Project: users should be able to authenticate via OAuth 2.0 with GitHub

This is your first question — start by asking about the most critical unknown.
```

**Interrogator output:**
```
[SYNTHESIZED SPEC DRAFT]
# OAuth Authentication

## Outcome
Users authenticate via GitHub OAuth 2.0.

## Given Preconditions
(none yet)

## When Trigger
(none yet)

## Then Expectations
(none yet)

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
What should happen if the user doesn't have a GitHub account?
```

**Respondee answer:**
```
[ANSWER]
The system should only support GitHub OAuth. If a user doesn't have a GitHub account, they cannot authenticate. We should show a clear error message directing them to create a GitHub account first.
```

### Round 2 (Interrogator synthesizes and asks)

**Interrogator output:**
```
[SYNTHESIZED SPEC DRAFT]
# OAuth Authentication

## Outcome
Users authenticate via GitHub OAuth 2.0.

## Given Preconditions
- User has a GitHub account

## When Trigger
User clicks "Sign in with GitHub" from the login page.

## Then Expectations
- OAuth flow initiates with GitHub
- On success, user record created/updated in database
- On auth failure, show error message

## Failure Modes
- F1: User has no GitHub account → show error directing them to create one

---RESPONDEE_REVIEW_ONLY---
[NEXT QUESTION]
What access scopes should the OAuth application request?
```

*(continues until Interrogator says DONE)*

---

## 14. Implementation Tasks

- [ ] Write `orchestrator.py` — main loop, file I/O, pi process management
- [ ] Write `templates/interrogator_system.txt`
- [ ] Write `templates/respondee_system.txt`
- [ ] Add `pi_json_extract()` helper — runs pi, parses JSONL, returns final text
- [ ] Add `parse_interrogator_output()` — splits on delimiter, returns (spec_draft, question_or_done)
- [ ] Add `parse_respondee_output()` — extracts answer text
- [ ] Add `append_transcript()` — writes Q&A to transcript.jsonl
- [ ] Write CLI with argparse
- [ ] Write unit tests for parsers
- [ ] Integration test with real pi invocation

---

## 15. Dependencies

- Python 3.11+
- `pi` CLI in PATH (any model/configured provider works)
- Standard library: `json`, `subprocess`, `pathlib`, `argparse`, `datetime`, `re`
