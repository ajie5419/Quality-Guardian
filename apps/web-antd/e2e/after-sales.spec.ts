import type { Locator, Page } from '@playwright/test';

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

import { expect, test } from '@playwright/test';

import { assertOwnedTargets } from '../../../scripts/e2e/safety.mjs';
import { waitOutDedupeWindow } from './dedupe-window';

const directory = process.env.QGS_E2E_ARTIFACT_DIR;
const fixture = JSON.parse(readFileSync(`${directory}/seed.json`, 'utf8'));
const require = createRequire(
  new URL('../../backend/package.json', import.meta.url),
);
const { PrismaClient } = require('@prisma/client');

let db: InstanceType<typeof PrismaClient>;

test.beforeAll(async () => {
  await assertOwnedTargets(process.env);
  db = new PrismaClient();
  // A failed test restarts the worker, not the owned database.
  expect(fixture.runId).toBe(process.env.QGS_E2E_RUN_ID);
  expect(fixture.afterSalesBeforeUI).toBe(0);
});
test.afterAll(async () => {
  await db?.$disconnect();
});
test.beforeEach(async ({ page }, info) => {
  await expect(page).toHaveURL('about:blank');
  await info.attach('error-context', {
    body: Buffer.from('Input snapshots suppressed; see masked screenshot.'),
    contentType: 'text/plain',
  });
});
test.afterEach(async ({ page }, info) => {
  await page.screenshot({
    path: `${directory}/${info.status}-${info.testId}.png`,
    mask: [page.locator('input')],
  });
});

async function login(page: Page, suffix = '') {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/auth/login?redirect=/qms/after-sales');
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
  const loginResponse = await response;
  const result = await loginResponse.json();
  expect(result.code).toBe(0);
  await expect(page).toHaveURL(/\/qms\/after-sales$/);
  await expect(page.locator('.after-sales-grid-card .vxe-table')).toBeVisible();
  return result.data.accessToken as string;
}

function field(page: Page, modal: Locator, name: string) {
  return modal.locator('.ant-form-item').filter({
    has: page.locator('.ant-form-item-label').getByText(name, { exact: true }),
  });
}

async function choose(page: Page, item: Locator, value: string) {
  await item.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(value, { exact: true })
    .click();
}

async function fill(page: Page, marker: string) {
  await page.getByRole('button', { name: /新建问题|新增/ }).click();
  const modal = page.locator('.ant-modal:visible');
  await expect(modal).toContainText('登记售后问题');
  await choose(page, field(page, modal, '工单号'), 'E2E-WO-001');
  await field(page, modal, '客户名称').locator('input').fill('E2E Customer');
  await field(page, modal, '部件名称')
    .locator('input')
    .fill('E2E Canonical Part');
  await field(page, modal, '项目地点').locator('input').fill(marker);
  await field(page, modal, '问题描述')
    .locator('textarea')
    .fill(`${marker} failure description`);
  await choose(page, field(page, modal, '产品类型'), 'E2E Product');
  await choose(
    page,
    field(page, modal, '二级分类').nth(0),
    'E2E Product Subtype',
  );
  await choose(page, field(page, modal, '缺陷分类'), 'E2E After Sales Defect');
  await choose(
    page,
    field(page, modal, '二级分类').nth(1),
    'E2E After Sales Subtype',
  );
  await field(page, modal, '责任部门').locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('E2E 采购部', { exact: true })
    .click();
  // Escape also cancels the enclosing modal; close the tree dropdown by blur.
  await modal.locator('.ant-modal-title').click();
  await choose(page, field(page, modal, '供应商名称'), 'E2E Supplier');
  await field(page, modal, '材料费').locator('input').fill('120');
  await field(page, modal, '人工及差旅费').locator('input').fill('30');
  return modal;
}

async function save(page: Page, modal: Locator, method = 'POST', id = '') {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/qms/after-sales${id ? `/${id}` : ''}`) &&
      r.request().method() === method,
  );
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  const res = await response;
  const result = await res.json();
  expect(res.status()).toBe(200);
  expect(result.code, result.message).toBe(0);
  await expect(modal).toBeHidden();
  return { result, payload: res.request().postDataJSON() };
}

async function snapshot(id: string, stage: string) {
  const row = await db.after_sales.findUniqueOrThrow({ where: { id } });
  writeFileSync(
    `${directory}/after-sales-${stage}-${id}.json`,
    JSON.stringify(row, null, 2),
  );
  return row;
}

async function create(page: Page, marker: string) {
  const modal = await fill(page, marker);
  const count = await db.after_sales.count();
  const saved = await save(page, modal);
  expect(await db.after_sales.count()).toBe(count + 1);
  const row = await snapshot(saved.result.data.id, 'created');
  expect(row.workOrderNumber).toBe('E2E-WO-001');
  expect(row.supplierBrandId).toBe(fixture.supplierId);
  expect(row.respDeptId).toBe(fixture.purchasingDepartmentId);
  expect(row.productCategoryId).toBe(fixture.afterSalesProductCategoryId);
  expect(row.productSubcategoryId).toBe(fixture.afterSalesProductSubcategoryId);
  expect(row.defectCategoryId).toBe(fixture.afterSalesDefectCategoryId);
  expect(row.defectSubcategoryId).toBe(fixture.afterSalesDefectSubcategoryId);
  expect(row.claimStatus).toBe('IN_PROGRESS');
  expect(row.version).toBe(1);
  expect(Number(row.materialCost)).toBe(120);
  expect(Number(row.laborTravelCost)).toBe(30);
  return { row, payload: saved.payload };
}

async function rowLocator(page: Page, marker: string) {
  await page.reload();
  const row = page
    .locator('.vxe-table--main-wrapper tr.vxe-body--row')
    .filter({ hasText: marker });
  await expect(row).toHaveCount(1);
  return row;
}

async function edit(page: Page, marker: string) {
  const row = await rowLocator(page, marker);
  const rowId = await row.getAttribute('rowid');
  const editButton = page
    .locator('.vxe-table--fixed-right-wrapper')
    .locator(`tr[rowid="${rowId}"]`)
    .locator('[data-action="edit"]');
  await expect(editButton).toBeVisible();
  await editButton.click();
  const modal = page.locator('.ant-modal:visible');
  await expect(modal).toContainText('编辑售后问题');
  return modal;
}

async function denied(
  page: Page,
  token: string,
  id: string,
  data: Record<string, unknown>,
  expected: number,
  label: string,
) {
  const before = await snapshot(id, `${label}-before`);
  const count = await db.after_sales.count();
  const res = await page.request.put(
    `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/after-sales/${id}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data,
    },
  );
  const body = await res.json();
  writeFileSync(
    `${directory}/after-sales-${label}-denial.json`,
    JSON.stringify({ status: res.status(), body }, null, 2),
  );
  expect(res.status()).toBe(expected);
  expect(body.code).not.toBe(0);
  expect(await snapshot(id, `${label}-after`)).toEqual(before);
  expect(await db.after_sales.count()).toBe(count);
}

test('after-sales UI registration completes with canonical identities, costs, reopened details and soft deletion', async ({
  page,
}) => {
  await login(page);
  const marker = 'E2E-AS-CLOSED';
  const { row } = await create(page, marker);
  const modal = await edit(page, marker);
  await choose(page, field(page, modal, '状态'), '已完成');
  await field(page, modal, '处理意见及方案')
    .locator('textarea')
    .fill('E2E replacement completed');
  await field(page, modal, '是否索赔').locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('是', { exact: true })
    .click();
  const picker = field(page, modal, '问题关闭日期').locator('.ant-picker');
  const dateInput = picker.locator('input');
  const today = await page.evaluate(() => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
  });
  await dateInput.click();
  await dateInput.pressSequentially(today, { delay: 30 });
  await dateInput.press('Enter');
  await expect(page.locator('.ant-picker-dropdown:visible')).toBeHidden();
  const selectedDate = await dateInput.inputValue();
  expect(selectedDate).toBe(today);
  const { payload } = await save(page, modal, 'PUT', row.id);
  expect(payload.closeDate).toBe(selectedDate);
  const completed = await snapshot(row.id, 'completed');
  expect(completed.claimStatus).toBe('COMPLETED');
  expect(completed.version).toBe(2);
  expect(completed.solution).toBe('E2E replacement completed');
  expect(completed.closeDate).not.toBeNull();
  expect(completed.closeDate.toISOString().slice(0, 10)).toBe(selectedDate);
  expect(completed.isClaim).toBe(true);
  expect(
    await db.quality_loss_index_jobs.count({ where: { sourcePk: row.id } }),
  ).toBeGreaterThan(0);
  expect(
    await db.metric_refresh_jobs.count({
      where: { entityId: fixture.supplierId },
    }),
  ).toBeGreaterThan(0);
  const visibleRow = await rowLocator(page, marker);
  await visibleRow.getByText(marker, { exact: true }).click();
  const drawer = page.locator('.ant-drawer-content:visible');
  await expect(drawer).toContainText('已完成');
  await expect(drawer).toContainText('E2E replacement completed');
  await expect(drawer).toContainText('E2E Supplier');
  await drawer.locator('.ant-drawer-close').click();
  const rowId = await visibleRow.getAttribute('rowid');
  const remove = page
    .locator('.vxe-table--fixed-right-wrapper')
    .locator(`tr[rowid="${rowId}"]`)
    .locator('[data-action="delete"]');
  await remove.hover();
  await expect(
    page.getByRole('tooltip').getByText('删除', { exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse(
    (r) =>
      r.url().includes(`/after-sales/${row.id}`) &&
      r.request().method() === 'DELETE',
  );
  await remove.click();
  await page
    .locator('.ant-modal-confirm:visible')
    .getByRole('button', { name: /确\s*定/ })
    .click();
  const deleteResponse = await response;
  const deleteBody = await deleteResponse.json();
  expect(deleteBody.code).toBe(0);
  const deleted = await snapshot(row.id, 'deleted');
  expect(deleted.isDeleted).toBe(true);
  expect(deleted.version).toBe(3);
  await page.reload();
  await expect(
    page
      .locator('.vxe-table--main-wrapper tr.vxe-body--row')
      .filter({ hasText: marker }),
  ).toHaveCount(0);
});

test('after-sales department and role denials preserve data and match desktop controls', async ({
  page,
}) => {
  await login(page);
  const { row } = await create(page, 'E2E-AS-ACCESS');
  for (const suffix of ['_foreign', '_reader']) {
    const token = await login(page, suffix);
    const listed = page.waitForResponse(
      (r) =>
        r.url().includes('/qms/after-sales?') && r.request().method() === 'GET',
    );
    await page.reload();
    const listResponse = await listed;
    const listBody = await listResponse.json();
    const items = listBody.data.items;
    expect(items.some((item: { id: string }) => item.id === row.id)).toBe(
      suffix === '_reader',
    );
    if (suffix === '_foreign') {
      await expect(
        page
          .locator('.vxe-table--main-wrapper tr.vxe-body--row')
          .filter({ hasText: 'E2E-AS-ACCESS' }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('button', { name: /新建问题|新增/ }),
      ).toHaveCount(0);
      await expect(
        page.locator('.vxe-table--fixed-right-wrapper').getByRole('button'),
      ).toHaveCount(0);
    }
    await denied(
      page,
      token,
      row.id,
      { version: row.version, resolutionPlan: 'unauthorized change' },
      suffix === '_foreign' ? 404 : 403,
      suffix.slice(1),
    );
    const before = await snapshot(row.id, `${suffix}-delete-before`);
    const res = await page.request.delete(
      `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/after-sales/${row.id}?version=${row.version}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(res.status()).toBe(suffix === '_foreign' ? 404 : 403);
    expect(await snapshot(row.id, `${suffix}-delete-after`)).toEqual(before);
  }
});

test('after-sales classification mismatch and stale edits are rejected without overwriting saved UI changes', async ({
  page,
}) => {
  const token = await login(page);
  const { row, payload } = await create(page, 'E2E-AS-CONFLICT');
  const modal = await edit(page, 'E2E-AS-CONFLICT');
  await field(page, modal, '处理意见及方案')
    .locator('textarea')
    .fill('E2E current version');
  await save(page, modal, 'PUT', row.id);
  await denied(
    page,
    token,
    row.id,
    { version: row.version, resolutionPlan: 'stale overwrite' },
    409,
    'stale',
  );
  await denied(
    page,
    token,
    row.id,
    {
      ...payload,
      version: row.version + 1,
      productSubcategoryId: fixture.afterSalesDefectSubcategoryId,
    },
    400,
    'classification',
  );
  await denied(
    page,
    token,
    row.id,
    { resolutionPlan: 'missing version' },
    400,
    'missing-version',
  );
  const visible = await rowLocator(page, 'E2E-AS-CONFLICT');
  await visible.getByText('E2E-AS-CONFLICT', { exact: true }).click();
  await expect(page.locator('.ant-drawer-content:visible')).toContainText(
    'E2E current version',
  );
});

test('after-sales lost response and UI retry reuse one create and reject a changed payload', async ({
  page,
}) => {
  const token = await login(page);
  const modal = await fill(page, 'E2E-AS-RETRY');
  const count = await db.after_sales.count();
  let requests = 0;
  let committedId = '';
  const operationKeys: string[] = [];
  await page.route('**/api/qms/after-sales', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests++;
    operationKeys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    const body = await response.json();
    if (response.status() === 409) {
      expect(body.code).not.toBe(0);
      return route.fulfill({ response });
    }
    expect(body.code).toBe(0);
    committedId = body.data.id;
    if (requests === 1) return route.abort('failed');
    return route.fulfill({ response });
  });
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  await expect.poll(() => committedId).not.toBe('');
  await expect(page.locator('.ant-message-notice').last()).toContainText(
    '失败',
  );
  expect(await db.after_sales.count()).toBe(count + 1);
  const fastRetry = page.waitForResponse(
    (r) =>
      r.url().endsWith('/qms/after-sales') && r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  const rejectedRetry = await fastRetry;
  expect(rejectedRetry.status()).toBe(409);
  expect(await db.after_sales.count()).toBe(count + 1);
  // Retry after the fast-rejection window, within the 5-minute replay window.
  await waitOutDedupeWindow(page);
  const saved = await save(page, modal);
  expect(saved.result.data.id).toBe(committedId);
  expect(operationKeys.length).toBeGreaterThanOrEqual(3);
  expect(new Set(operationKeys).size).toBe(1);
  expect(await db.after_sales.count()).toBe(count + 1);
  await page.unroute('**/api/qms/after-sales');
  const before = await snapshot(committedId, 'retry-before');
  const conflict = await page.request.post(
    `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/after-sales`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': operationKeys[0],
      },
      data: { ...saved.payload, location: 'E2E changed payload' },
    },
  );
  expect(conflict.status()).toBe(409);
  const conflictBody = await conflict.json();
  expect(conflictBody.code).not.toBe(0);
  expect(await snapshot(committedId, 'retry-after')).toEqual(before);
  expect(await db.after_sales.count()).toBe(count + 1);
  await rowLocator(page, 'E2E-AS-RETRY');
});
