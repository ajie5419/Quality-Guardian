import type { Locator, Page } from '@playwright/test';

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

async function row(page: Page, code: string) {
  const targetRow = page
    .locator('tr.vxe-body--row')
    .filter({ hasText: code })
    .first();
  await expect(targetRow).toBeVisible();
  return targetRow;
}

async function action(page: Page, code: string, name: 'delete' | 'edit') {
  const visibleRow = await row(page, code);
  const id = await visibleRow.getAttribute('rowid');
  const button = page
    .locator(`.vxe-table--fixed-right-wrapper tr[rowid="${id}"]`)
    .locator(`[data-action="${name}"]`);
  await expect(button).toBeVisible();
  await button.click();
}

async function snapshot(code: string, stage: string) {
  const result = {
    order: await db.work_orders.findFirst({
      where: { workOrderNumber: code },
      select: {
        customerName: true,
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

function field(scope: Locator, label: string) {
  return scope.locator('label').filter({ hasText: label }).locator('..');
}

/**
 * Registration goes through the real Vben form modal. Department is a
 * TreeSelect, so the seeded production department is picked from the panel.
 */
async function createOrderUI(
  page: Page,
  values: {
    code: string;
    customer?: string;
    project?: string;
    quantity?: number;
  },
) {
  await page
    .getByRole('button', { name: /新建工单|创建工单/ })
    .first()
    .click();
  const modal = page.locator('[role="dialog"]:visible').first();
  await expect(modal).toBeVisible();

  const numberInput = field(modal, /工单号|Work Order Number/).locator('input');
  await numberInput.fill(values.code);
  const customerInput = field(modal, /客户名称|Customer/).locator('input');
  await customerInput.fill(values.customer || marker('Customer'));
  const projectInput = field(modal, /项目名称|Project/).locator('input');
  await projectInput.fill(values.project || 'E2E Project');

  // Department TreeSelect: open the panel and choose the seeded department.
  await field(modal, /事业部|Division/)
    .locator('.ant-select')
    .click();
  await page
    .locator('.ant-select-tree-node-content-wrapper')
    .getByText('E2E Production', { exact: true })
    .click();

  const quantityInput = field(modal, /数量|Quantity/).locator('input');
  await quantityInput.fill(String(values.quantity ?? 5));

  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/qms/work-order' &&
      r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: /确\s*定|确\s*认|OK/ }).click();
  return response;
}

test('work-order UI registration, versioned edit and soft delete keep canonical fields', async ({
  page,
}) => {
  await login(page);
  const code = orderNumber('CRUD');
  const before = await db.work_orders.count({
    where: { workOrderNumber: code },
  });
  expect(before).toBe(0);

  const created = await createOrderUI(page, { code, quantity: 7 });
  expect(created.status()).toBe(200);
  const createdBody = await created.json();
  expect(createdBody.code, createdBody.message).toBe(0);

  const initial = await snapshot(code, 'created');
  expect(initial.order).toMatchObject({
    isDeleted: false,
    projectName: 'E2E Project',
    quantity: 7,
    version: 1,
  });

  await action(page, code, 'edit');
  const editModal = page.locator('[role="dialog"]:visible').first();
  await expect(editModal).toBeVisible();
  await field(editModal, /数量|Quantity/)
    .locator('input')
    .fill('9');
  const updateResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/qms/work-order' &&
      r.request().method() === 'PUT',
  );
  await editModal.getByRole('button', { name: /确\s*定|确\s*认|OK/ }).click();
  const updRes = await updateResponse;
  expect(updRes.status()).toBe(200);

  const edited = await snapshot(code, 'edited');
  expect(edited.order.version).toBe(2);
  expect(Number(edited.order.quantity)).toBe(9);

  // Stale editors must not overwrite the newer version.
  const stale = await page.request.put(`${api}?id=${code}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { quantity: 11, version: 1 },
  });
  expect(stale.status()).toBe(409);
  const missingVersion = await page.request.put(`${api}?id=${code}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { quantity: 12 },
  });
  expect(missingVersion.status()).toBe(400);
  expect(await snapshot(code, 'after-locked-writes')).toEqual(edited);

  await action(page, code, 'delete');
  const deleteResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/qms/work-order' &&
      r.request().method() === 'DELETE',
  );
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /确\s*定|确\s*认/ })
    .click();
  const delRes = await deleteResponse;
  expect(delRes.status()).toBe(200);
  const delSnap = await snapshot(code, 'deleted');
  expect(delSnap.order.isDeleted).toBe(true);
});

test('work-order requirement identity contract rejects names and unknown canonical ids', async ({
  page,
}) => {
  await login(page);
  const code = orderNumber('REQ');
  await createOrderUI(page, { code });

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

test('work-order reader and foreign department cannot write and keep data unchanged', async ({
  page,
}) => {
  await login(page);
  const code = orderNumber('PERM');
  await createOrderUI(page, { code });
  const before = await snapshot(code, 'before-permissions');

  const readerToken = await login(page, '_reader');
  await expect(
    page.getByRole('button', { name: /新建工单|创建工单/ }),
  ).toHaveCount(0);
  for (const [method, query] of [
    ['PUT', `?id=${code}`],
    ['DELETE', `?id=${code}`],
  ] as const) {
    const denied = await page.request.fetch(`${api}${query}`, {
      method,
      headers: { Authorization: `Bearer ${readerToken}` },
      ...(method === 'PUT'
        ? { data: { quantity: 3, version: before.order.version } }
        : {}),
    });
    expect(denied.status()).toBe(403);
  }

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
  const crossDepartment = await page.request.put(`${api}?id=${code}`, {
    headers: { Authorization: `Bearer ${foreignToken}` },
    data: { quantity: 4, version: before.order.version },
  });
  expect([403, 404]).toContain(crossDepartment.status());
  expect(await snapshot(code, 'after-permissions')).toEqual(before);
});

test('work-order duplicate registration and illegal status are rejected without side effects', async ({
  page,
}) => {
  await login(page);
  const code = orderNumber('DUP');
  await createOrderUI(page, { code });
  const before = await snapshot(code, 'before-duplicate');

  const duplicate = await page.request.post(api, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      customerName: marker('Duplicate'),
      deliveryDate: '2030-01-01',
      projectName: 'E2E Project',
      quantity: 1,
      status: 'OPEN',
      workOrderNumber: code,
    },
  });
  expect(duplicate.status()).toBe(409);

  const illegalStatus = await page.request.put(`${api}?id=${code}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'NOT_A_STATUS', version: before.order.version },
  });
  expect(illegalStatus.status()).toBe(400);

  const missing = await page.request.put(`${api}?id=${code}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { quantity: 2 },
  });
  expect(missing.status()).toBe(400);

  expect(await snapshot(code, 'after-rejections')).toEqual(before);
  expect(token).toBeTruthy();
});

test('work-order import upserts rows and export returns the scoped catalog', async ({
  page,
}) => {
  await login(page);
  const code = orderNumber('IMPORT');
  const imported = await page.request.post(`${api}/import`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      items: [
        {
          customerName: marker('Imported'),
          deliveryDate: '2030-01-01',
          projectName: 'E2E Project',
          quantity: 4,
          status: 'OPEN',
          workOrderNumber: code,
        },
      ],
    },
  });
  expect(imported.status()).toBe(200);
  const importedSnapshot = await snapshot(code, 'imported');
  const row = importedSnapshot.order;
  expect(row).not.toBeNull();
  expect(row).toMatchObject({
    customerName: marker('Imported'),
    isDeleted: false,
    quantity: 4,
  });

  // A repeated import upserts the same work order instead of duplicating it.
  await page.request.post(`${api}/import`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      items: [
        {
          customerName: marker('ImportedUpdated'),
          deliveryDate: '2030-01-01',
          projectName: 'E2E Project',
          quantity: 6,
          status: 'OPEN',
          workOrderNumber: code,
        },
      ],
    },
  });
  expect(await db.work_orders.count({ where: { workOrderNumber: code } })).toBe(
    1,
  );
  const persistedOrder = await db.work_orders.findFirst({
    where: { workOrderNumber: code },
  });
  expect(Number(persistedOrder?.quantity)).toBe(6);

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
