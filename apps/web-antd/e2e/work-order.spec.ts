import type { APIResponse, Page } from '@playwright/test';

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

import { expect, test } from '@playwright/test';

import { assertOwnedTargets } from '../../../scripts/e2e/safety.mjs';
import { remainingDedupeWait } from './dedupe-window';

const directory = process.env.QGS_E2E_ARTIFACT_DIR;
const fixture = JSON.parse(readFileSync(`${directory}/seed.json`, 'utf8'));
const require = createRequire(
  new URL('../../backend/package.json', import.meta.url),
);
const { PrismaClient } = require('@prisma/client');

let db: InstanceType<typeof PrismaClient>;
const api = `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/work-order`;
const integration = `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/integration/fulfillment`;
const clientHeaders = {
  'x-identity-client-id': process.env.QMS_IDENTITY_CLIENT_ID || '',
  'x-identity-client-secret': process.env.QMS_IDENTITY_CLIENT_SECRET || '',
};
const MANAGED_MESSAGE = '工单由履约系统维护，请到履约系统操作';
const target = '/qms/work-order';
const lastLogin = new Map<string, number>();

test.beforeAll(async () => {
  await assertOwnedTargets(process.env);
  expect(fixture.runId).toBe(process.env.QGS_E2E_RUN_ID);
  // Requirements are created only through the tested UI; seeded work orders
  // stay as cross-module prerequisites and are recorded as the baseline.
  expect(fixture.workOrderRequirementBeforeUI).toBe(0);
  expect(
    fixture.workOrderBeforeUI.map((row: { workOrderNumber: string }) =>
      row.workOrderNumber.replace(/^E2E-WO/, ''),
    ),
  ).toEqual(['-001', '-002', '-STATIONS']);
  db = new PrismaClient();
});
test.afterAll(async () => db?.$disconnect());
test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(
    page
      .locator('.inspection-request-global-alert')
      .getByRole('button', { name: '标记已读' }),
    async (button) => {
      await button.click();
    },
    { noWaitAfter: true },
  );
});
test.afterEach(async ({ page }, info) => {
  await page.screenshot({
    path: `${directory}/work-order-${info.status}-${info.testId}.png`,
    mask: [page.locator('input'), page.locator('textarea')],
  });
});

async function login(page: Page, suffix = '') {
  const remaining = remainingDedupeWait(lastLogin.get(suffix));
  if (remaining > 0) await page.waitForTimeout(remaining);
  await page.context().clearCookies();
  await page.goto(`/auth/login?redirect=${target}`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`/auth/login?redirect=${target}`);
  await page
    .getByPlaceholder('请输入用户名')
    .fill(`${process.env.QGS_E2E_USERNAME}${suffix}`);
  await page
    .getByPlaceholder('密码', { exact: true })
    .fill(process.env.QGS_E2E_PASSWORD || '');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: /登\s*录/ })
    .or(page.locator('button[aria-label="login"]'))
    .click();
  const loginRes = await response;
  const result = await loginRes.json();
  lastLogin.set(suffix, Date.now());
  expect(result.code, result.message).toBe(0);
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  await expect(page.locator('.vxe-table').first()).toBeVisible();
  return result.data.accessToken as string;
}

/** Each case owns a numbered order so parallel and rerun data stay separable. */
function orderNumber(label: string) {
  return `E2E-WOUI-${label}-${fixture.runId.slice(0, 6).toUpperCase()}`;
}

function marker(label: string) {
  return `E2E-WOUI-${fixture.runId}-${label}`;
}

async function dataOf(response: APIResponse) {
  const body = await response.json();
  return body.data;
}

async function statusOf(pending: Promise<APIResponse>) {
  const response = await pending;
  return response.status();
}

/** A delivery date inside the default (current-year) list view. */
function currentYearDate() {
  return `${new Date().getFullYear()}-12-31`;
}

async function row(page: Page, code: string) {
  const targetRow = page
    .locator('tr.vxe-body--row')
    .filter({ hasText: code })
    .first();
  await expect(targetRow).toBeVisible();
  return targetRow;
}

async function snapshot(code: string, stage: string) {
  const result = {
    order: await db.work_orders.findFirst({
      where: { workOrderNumber: code },
      select: {
        customerName: true,
        customerNameId: true,
        division: true,
        divisionId: true,
        isDeleted: true,
        projectName: true,
        quantity: true,
        status: true,
        version: true,
      },
    }),
    requirements: await db.work_order_requirements.findMany({
      where: { workOrderNumber: code },
      orderBy: { id: 'asc' },
      select: {
        confirmStatus: true,
        confirmedAt: true,
        confirmer: true,
        id: true,
        partId: true,
        partName: true,
        processId: true,
        processName: true,
        requirementName: true,
      },
    }),
  };
  writeFileSync(
    `${directory}/work-order-state-${stage}-${code}.json`,
    JSON.stringify(result, null, 2),
  );
  return result;
}

/** Work orders are created only by the fulfillment system integration. */
async function createOrderViaFulfillment(
  page: Page,
  code: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await page.request.post(`${integration}/work-orders`, {
    headers: clientHeaders,
    data: {
      actorUserId: fixture.userId,
      customerNameId: fixture.customerId,
      deliveryDate: currentYearDate(),
      divisionId: fixture.departmentId,
      projectName: 'E2E Project',
      quantity: 5,
      workOrderNumber: code,
      ...overrides,
    },
  });
  const body = await response.json();
  expect(response.status(), body.message).toBe(200);
  return body.data;
}

test('work-order page is view/export only and names the fulfillment system', async ({
  page,
}) => {
  const code = orderNumber('VIEW');
  await createOrderViaFulfillment(page, code);
  await login(page);

  await expect(page.getByText('工单由履约系统维护').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: /新建工单|创建工单/ }),
  ).toHaveCount(0);
  const visibleRow = await row(page, code);
  const id = await visibleRow.getAttribute('rowid');
  await expect(
    page.locator(`tr[rowid="${id}"] [data-action="edit"]`),
  ).toHaveCount(0);
  await expect(
    page.locator(`tr[rowid="${id}"] [data-action="delete"]`),
  ).toHaveCount(0);
});

test('qms work-order write endpoints answer 403 and keep data unchanged', async ({
  page,
}) => {
  const code = orderNumber('LOCKED');
  await createOrderViaFulfillment(page, code);
  const token = await login(page);
  const before = await snapshot(code, 'before-qms-writes');
  const headers = { Authorization: `Bearer ${token}` };

  for (const request of [
    {
      method: 'POST',
      url: api,
      data: {
        customerName: marker('Blocked'),
        deliveryDate: '2030-01-01',
        quantity: 1,
        workOrderNumber: orderNumber('BLOCKED'),
      },
    },
    {
      method: 'PUT',
      url: `${api}?id=${code}`,
      data: { quantity: 11, version: before.order.version },
    },
    {
      method: 'DELETE',
      url: `${api}?id=${code}&version=${before.order.version}`,
    },
    {
      method: 'POST',
      url: `${api}/import`,
      data: { items: [{ customerName: 'X', workOrderNumber: code }] },
    },
    { method: 'POST', url: `${api}/batch-delete`, data: { ids: [code] } },
  ]) {
    const denied = await page.request.fetch(request.url, {
      method: request.method,
      headers,
      ...(request.data ? { data: request.data } : {}),
    });
    expect(denied.status(), `${request.method} ${request.url}`).toBe(403);
    const deniedBody = await denied.json();
    expect(deniedBody.message).toBe(MANAGED_MESSAGE);
  }
  expect(await snapshot(code, 'after-qms-writes')).toEqual(before);
  expect(
    await db.work_orders.count({
      where: { workOrderNumber: orderNumber('BLOCKED') },
    }),
  ).toBe(0);
});

test('fulfillment integration creates, edits under version lock and cancels', async ({
  page,
}) => {
  const code = orderNumber('SYNC');
  const unauthenticated = await page.request.post(
    `${integration}/work-orders`,
    {
      data: { workOrderNumber: code },
    },
  );
  expect(unauthenticated.status()).toBe(401);

  const created = await createOrderViaFulfillment(page, code, { quantity: 7 });
  expect(created).toMatchObject({
    customerName: 'E2E Customer',
    customerNameId: fixture.customerId,
    division: 'E2E Production',
    divisionId: fixture.departmentId,
    quantity: 7,
    status: 'OPEN',
    version: 1,
    workOrderNumber: code,
  });

  const duplicate = await page.request.post(`${integration}/work-orders`, {
    headers: clientHeaders,
    data: {
      actorUserId: fixture.userId,
      customerNameId: fixture.customerId,
      deliveryDate: currentYearDate(),
      quantity: 1,
      workOrderNumber: code,
    },
  });
  expect(duplicate.status()).toBe(409);
  const duplicateBody = await duplicate.json();
  expect(duplicateBody.error).toEqual({ code: 'WORK_ORDER_EXISTS' });

  const update = (data: Record<string, unknown>) =>
    page.request.put(`${integration}/work-orders/${code}`, {
      headers: clientHeaders,
      data: { actorUserId: fixture.userId, ...data },
    });
  const edited = await update({
    quantity: 9,
    status: 'IN_PROGRESS',
    version: 1,
  });
  expect(edited.status()).toBe(200);
  expect(await dataOf(edited)).toMatchObject({
    quantity: 9,
    status: 'IN_PROGRESS',
    version: 2,
  });
  expect(await statusOf(update({ quantity: 11, version: 1 }))).toBe(409);
  expect(
    await statusOf(update({ version: 2, workOrderNumber: `${code}-X` })),
  ).toBe(400);
  expect(
    await statusOf(
      update({ actorUserId: 'missing-user', quantity: 3, version: 2 }),
    ),
  ).toBe(400);
  const afterEdits = await snapshot(code, 'integration-edited');
  expect(afterEdits.order).toMatchObject({ quantity: 9, version: 2 });

  const cancel = () =>
    page.request.post(`${integration}/work-orders/${code}/cancel`, {
      headers: clientHeaders,
      data: { actorUserId: fixture.userId, version: 2 },
    });
  const cancelled = await cancel();
  expect(cancelled.status()).toBe(200);
  expect(await dataOf(cancelled)).toMatchObject({
    status: 'CANCELLED',
    version: 3,
  });
  const repeated = await cancel();
  expect(repeated.status()).toBe(200);
  expect(await dataOf(repeated)).toMatchObject({
    status: 'CANCELLED',
    version: 3,
  });
  expect(await statusOf(update({ quantity: 1, version: 3 }))).toBe(400);
  const afterCancel = await snapshot(code, 'integration-cancelled');
  expect(afterCancel.order).toMatchObject({
    status: 'CANCELLED',
    version: 3,
  });

  const audits = await db.audit_logs.findMany({
    where: { targetId: code, targetType: 'work_order' },
    select: { details: true, userId: true },
  });
  expect(audits).toHaveLength(3);
  expect(
    audits.every(
      (entry: { userId: string }) => entry.userId === fixture.userId,
    ),
  ).toBe(true);

  const feed = await page.request.get(
    `${integration}/work-orders?since=${encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())}`,
    { headers: clientHeaders },
  );
  expect(feed.status()).toBe(200);
  const feedData = await dataOf(feed);
  const item = (feedData.items || []).find(
    (entry: { workOrderNumber: string }) => entry.workOrderNumber === code,
  );
  expect(item).toMatchObject({
    customerNameId: fixture.customerId,
    divisionId: fixture.departmentId,
    status: 'CANCELLED',
    version: 3,
  });

  const customers = await page.request.get(`${integration}/customers`, {
    headers: clientHeaders,
  });
  expect(customers.status()).toBe(200);
  expect(await dataOf(customers)).toContainEqual({
    id: fixture.customerId,
    name: 'E2E Customer',
  });
});

test('work-order requirement identity contract rejects names and unknown canonical ids', async ({
  page,
}) => {
  const code = orderNumber('REQ');
  await createOrderViaFulfillment(page, code);
  const token = await login(page);

  // V2 identity contract: names alone cannot rebuild the snapshot.
  const nameOnly = await page.request.post(`${api}/requirements`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      identityContractVersion: 2,
      partName: 'E2E Canonical Part',
      processName: 'E2E Process',
      requirementName: marker('name-only'),
      workOrderNumber: code,
    },
  });
  expect(nameOnly.status()).toBe(400);

  const unknownIds = await page.request.post(`${api}/requirements`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      identityContractVersion: 2,
      partId: 'e2e-missing-part',
      processId: 'e2e-missing-process',
      requirementName: marker('unknown-ids'),
      workOrderNumber: code,
    },
  });
  expect([400, 404]).toContain(unknownIds.status());
  expect(
    await db.work_order_requirements.count({
      where: { workOrderNumber: code },
    }),
  ).toBe(0);

  const created = await page.request.post(`${api}/requirements`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      identityContractVersion: 2,
      partId: fixture.partId,
      processId: fixture.processId,
      requirementName: marker('canonical'),
      responsiblePerson: 'E2E Owner',
      workOrderNumber: code,
    },
  });
  expect(created.status()).toBe(200);
  const reqSnap = await snapshot(code, 'requirement-created');
  const [requirement] = reqSnap.requirements;
  expect(requirement).toMatchObject({
    confirmStatus: 'PENDING',
    partId: fixture.partId,
    partName: 'E2E Canonical Part',
    processId: fixture.processId,
  });
  expect(requirement.processName).toBeTruthy();

  // Confirm and revoke are explicit state operations under Confirm rights.
  const confirmed = await page.request.put(
    `${api}/requirements/${requirement.id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { confirm: true },
    },
  );
  expect(confirmed.status()).toBe(200);
  const confirmSnap = await snapshot(code, 'requirement-confirmed');
  const afterConfirm = confirmSnap.requirements[0];
  expect(afterConfirm.confirmStatus).toBe('CONFIRMED');
  expect(afterConfirm.confirmedAt).not.toBeNull();
  expect(afterConfirm.confirmer).toBeTruthy();

  const revoked = await page.request.put(
    `${api}/requirements/${requirement.id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { confirm: false },
    },
  );
  expect(revoked.status()).toBe(200);
  const revokeSnap = await snapshot(code, 'requirement-revoked');
  const afterRevoke = revokeSnap.requirements[0];
  expect(afterRevoke.confirmStatus).toBe('PENDING');
  expect(afterRevoke.confirmedAt).toBeNull();
});

test('foreign department cannot see a fulfillment-created work order', async ({
  page,
}) => {
  const code = orderNumber('PERM');
  await createOrderViaFulfillment(page, code);
  const before = await snapshot(code, 'before-permissions');

  const foreignToken = await login(page, '_foreign');
  const foreignList = await page.request.get(api, {
    headers: { Authorization: `Bearer ${foreignToken}` },
  });
  expect(foreignList.status()).toBe(200);
  const foreignBody = await foreignList.json();
  const visible = (foreignBody.data?.items || []).some(
    (item: { workOrderNumber: string }) => item.workOrderNumber === code,
  );
  expect(visible).toBe(false);
  expect(await snapshot(code, 'after-permissions')).toEqual(before);
});

test('work-order export returns the scoped catalog', async ({ page }) => {
  const code = orderNumber('EXPORT');
  await createOrderViaFulfillment(page, code, { deliveryDate: '2030-01-01' });
  const token = await login(page);

  const exported = await page.request.get(`${api}/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(exported.status()).toBe(200);
  const exportBody = await exported.json();
  const exportedNumbers = (exportBody.data?.items || []).map(
    (item: { workOrderNumber: string }) => item.workOrderNumber,
  );
  // The export shares the list query semantics: the default view is scoped to
  // the current delivery year, so a 2030 delivery date is legitimately
  // filtered out rather than silently missing.
  expect(exportedNumbers).not.toContain(code);

  const unfiltered = await page.request.get(
    `${api}/export?ignoreYearFilter=true&workOrderNumber=${code}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(unfiltered.status()).toBe(200);
  const unfiltBody = await unfiltered.json();
  const unfilteredNumbers = (unfiltBody.data?.items || []).map(
    (item: { workOrderNumber: string }) => item.workOrderNumber,
  );
  expect(unfilteredNumbers).toEqual([code]);
});
