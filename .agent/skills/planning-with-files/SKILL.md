---
name: planning-with-files
description: "Work like Manus: Use persistent markdown files as your \"working memory on disk\"."
---

# Planning with Files (Manus-style)

This skill implements a persistent planning, progress tracking, and knowledge storage workflow using markdown files. It solves the context window limitation by treating the project directory as a permanent "working memory."

## Core Workflow

Before starting any complex task, you **MUST** initialize the planning files.

### 1. The Three-File Pattern
- **`task_plan.md`**: Overall technical plan, goals, and architectural decisions.
- **`progress.md`**: Real-time status tracker (Checkpoints, Completed, Blocked).
- **`findings.md`**: Research log, error records, and technical discoveries.

## Key Rules

1.  **Plan First**: Never start a project or refactor without creating `task_plan.md`.
2.  **The 2-Action Rule**: Record findings in `findings.md` after every *two* major research operations (web searches, large file reads).
3.  **Log ALL Errors**: Every terminal error or bug discovered must be documented in `findings.md` immediately to prevent repeating failed attempts.
4.  **Context Rebuild**: If a session is interrupted, re-read all three files *before* continuing to restore full mental context.

## Templates

Use the templates provided in the `templates/` directory of this skill.

---

*Note: This skill is inspired by the OthmanAdi/planning-with-files workflow.*
