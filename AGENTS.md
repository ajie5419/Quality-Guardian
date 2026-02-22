# QMS Project Agent Rules

This file defines mandatory repository-level rules for AI/code agents.

## QMS Frontend Mandatory Rules

In `/Users/zhaoxiaojie/Downloads/main/Quality-Guardian`, the rules below are mandatory and take precedence over general coding habits.

### Rule IDs (for new or modified files)

- `R1`: `views/qms/**` MUST NOT call `requestClient` directly.
- `R2`: List data consumed by page layer MUST be normalized to `{ items, total }`.
- `R3`: Any `index.vue` with more than 500 lines MUST be split.
- `R4`: New or changed QMS API access MUST go through `apps/web-antd/src/api/qms/*`.
- `R5`: Before submission, run `pnpm lint`, `pnpm check:type`, `pnpm check:qms-arch`.

### Scope

- Applies to all changes under:
  - `apps/web-antd/src/views/qms/**`
  - `apps/web-antd/src/api/qms/**`
- Enforcement is incremental: rules are hard-gated for newly added or modified files.

### Enforcement

- PR review must check the Rule IDs above.
- CI must run `pnpm run check:qms-arch`.
- If any rule conflicts with local coding preference, these rules win.
