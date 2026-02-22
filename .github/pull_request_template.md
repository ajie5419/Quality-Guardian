## Summary

- What changed:
- Why:

## QMS Mandatory Rules Checklist (AGENTS.md)

- [ ] `R1` No direct `requestClient` usage in `views/qms/**`
- [ ] `R2` List response consumed by pages is normalized to `{ items, total }`
- [ ] `R3` Any `index.vue` over 500 lines was split (or no file exceeds 500)
- [ ] `R4` QMS API calls are placed in `apps/web-antd/src/api/qms/*` (not page layer)
- [ ] `R5` Commands run locally:
  - [ ] `pnpm lint`
  - [ ] `pnpm check:type`
  - [ ] `pnpm check:qms-arch`

## Validation Output

Paste key output or screenshots for:

1. lint
2. typecheck
3. qms architecture check
