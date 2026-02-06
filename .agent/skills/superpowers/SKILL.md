---
name: superpowers
description: "Agentic skills framework & software development methodology focused on Spec-driven development and TDD."
---

# Superpowers: Agentic Development Framework

This skill implements the "Superpowers" methodology, which empowers the AI to act as a self-correcting, autonomous software engineer. It emphasizes writing specifications before implementation and following a strict TDD cycle.

## Core Principles

1.  **Spec-Driven Development**: Always begin with a `specification.md` that defines the *what* and *why* before deciding the *how*.
2.  **RED-GREEN-REFACTOR**: Implementation must follow a cycle of failing tests (RED), passing tests (GREEN), and refining code (REFACTOR).
3.  **Project Awareness**: The agent must maintain a mental model of the entire project context, aided by persistent files.
4.  **Zero Guesswork**: If a requirement is ambiguous, the agent must ask for clarification instead of making assumptions.

## Workflow

### Phase 1: Brainstorming & Specification
- Use collaborative dialogue to turn ideas into a technical `spec.md`.
- Define explicit success criteria and edge cases.

### Phase 2: Implementation Planning
- Break down the spec into atomic, testable tasks.
- Create an `implementation_plan.md` that describes exact file changes.

### Phase 3: Execution (TDD)
- For each task, write/update tests first.
- Implement only what is necessary to pass the tests (YAGNI).
- Refactor for clarity and maintainability (DRY).

## Key Rules

- **Trigger Condition**: Invoke the `superpowers` logic at the start of any new feature request or architectural change.
- **Strict Compliance**: Follow the sub-skills for `writing-plans` and `executing-plans` exactly as defined in templates.
- **Avoid Summarization**: Don't summarize your workflow in descriptions; execute it directly.

---

*Note: This framework is adapted from the obra/superpowers methodology.*
