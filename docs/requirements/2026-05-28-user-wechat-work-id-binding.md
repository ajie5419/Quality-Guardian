# Wechat Work User Binding

## Date

2026-05-28

## Requirement

Add a Wechat Work account binding field to system user management so administrators can bind a QMS user to the corresponding Wechat Work contacts `userId`.

## Scope

- Backend user create/update/list data flow
- System management user table
- System management user create/edit form

## Behavior

- Field name: `wechatWorkId`
- UI label: Wechat Work ID / 企微账号
- Input type: text
- Required: no
- Placeholder: `请输入企业微信通讯录中的账号`
- Empty input is saved as `null` to avoid occupying the unique field with an empty string.

## Verification

- `pnpm -C apps/backend exec tsc --noEmit`
- `pnpm -C apps/web-antd exec vue-tsc --noEmit`
- `pnpm run check:qms-arch`
