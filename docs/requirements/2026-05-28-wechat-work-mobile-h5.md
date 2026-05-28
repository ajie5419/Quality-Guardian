# Wechat Work Mobile H5

## Date

2026-05-28

## Requirement

Add a mobile H5 entry for the Wechat Work self-built application at `https://www.tlqms.com/mobile/tasks`.

The mobile flow supports:

- Wechat Work OAuth auto login with AgentId `1000002`
- Dispatcher task list for submitted inspection requests
- Mobile dispatch to an inspector
- Inspector task list for dispatched inspection requests
- Mobile inspection close with pass or fail result
- Wechat Work text-card notifications after inspection request creation and dispatch

## Implementation Notes

- Mobile pages live under `apps/web-antd/src/views/mobile/`.
- Mobile routes are external static routes under `/mobile/*` and bypass the PC layout and access guard.
- Wechat Work login endpoint is `POST /api/auth/wechat-work`.
- Backend Wechat Work login logic belongs to the user module.
- Notification delivery is disabled automatically when Wechat Work environment variables are missing.
- Users must be bound with `users.wechatWorkId` to use auto login or receive Wechat Work notifications.

## Environment Variables

Backend:

```bash
WECHAT_WORK_CORP_ID=
WECHAT_WORK_SECRET=
WECHAT_WORK_AGENT_ID=1000002
```

Frontend:

```bash
VITE_WECHAT_WORK_CORP_ID=
VITE_WECHAT_WORK_AGENT_ID=1000002
```

## Manual Wechat Work Admin Configuration

Configure these values in Wechat Work admin:

- Application homepage: `https://www.tlqms.com/mobile/tasks`
- Web authorization and JS-SDK trusted domain: `www.tlqms.com`
- OAuth2 callback domain: `www.tlqms.com`

## Verification

- `pnpm -C apps/backend exec tsc --noEmit`
- `pnpm -C apps/web-antd exec vue-tsc --noEmit`
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request-create.schema.test.ts modules/inspection/inspection.service.test.ts`
- `pnpm run check:qms-arch`
