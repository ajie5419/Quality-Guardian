import type { Locator, Page } from '@playwright/test';

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

import { expect, test } from '@playwright/test';

import { assertOwnedTargets } from '../../../scripts/e2e/safety.mjs';
import { remainingDedupeWait } from './dedupe-window';

/**
 * Phase-2 gap coverage for the inspection module. The already-verified
 * request/material/manual-record flows live in business-chain.spec.ts; this
 * spec owns today-incoming, the request dashboard and the inspection records
 * page (multi-type listing, filters, detail drawer, scoped export, denials).
 */
const directory = process.env.QGS_E2E_ARTIFACT_DIR;
const fixture = JSON.parse(readFileSync(`${directory}/seed.json`, 'utf8'));
const require = createRequire(
  new URL('../../backend/package.json', import.meta.url),
);
const { PrismaClient } = require('@prisma/client');

let db: InstanceType<typeof PrismaClient>;
const lastLogin = new Map<string, number>();
const origin = process.env.QGS_E2E_BACKEND_ORIGIN;
const records = '/qms/inspection/records';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function today() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Asia/Shanghai wall-clock boundaries, mirroring the backend stats range. */
function shanghaiRange(period: 'month' | 'year') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(new Date());
  const [year, month, day] = parts.split('-');
  const start =
    period === 'year'
      ? new Date(`${year}-01-01T00:00:00+08:00`)
      : new Date(`${year}-${month}-01T00:00:00+08:00`);
  const end = new Date(
    new Date(`${year}-${month}-${day}T00:00:00+08:00`).getTime() +
      24 * 60 * 60 * 1000,
  );
  return { end, start };
}

test.beforeAll(async () => {
  await assertOwnedTargets(process.env);
  expect(fixture.runId).toBe(process.env.QGS_E2E_RUN_ID);
  // Requests are created only through the tested UI/isolated API writes.
  expect(fixture.requestsBeforeUI).toBe(0);
  db = new PrismaClient();
});
test.afterAll(async () => db?.$disconnect());
test.beforeEach(async ({ page }, info) => {
  await page.addLocatorHandler(
    page.locator('.inspection-request-global-alert').getByRole('button', {
      name: '标记已读',
    }),
    async (button) => {
      await button.click();
    },
    { noWaitAfter: true },
  );
  await info.attach('error-context', {
    body: Buffer.from('Input snapshots suppressed; see masked screenshot.'),
    contentType: 'text/plain',
  });
});
test.afterEach(async ({ page }, info) => {
  await page.screenshot({
    path: `${directory}/inspection-management-${info.status}-${info.testId}.png`,
    mask: [page.locator('input'), page.locator('textarea')],
  });
});

async function login(
  page: Page,
  target: string,
  suffix = '',
  assertLanding = true,
) {
  const remaining = remainingDedupeWait(lastLogin.get(suffix));
  if (remaining > 0) await page.waitForTimeout(remaining);
  await page.context().clearCookies();
  await page.goto('/auth/login');
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
  if (assertLanding) {
    await expect(page).toHaveURL(
      new RegExp(`${target.replaceAll('/', String.raw`\/`)}$`),
    );
  }
  return result.data.accessToken as string;
}

function _field(scope: Locator, label: string) {
  return scope.locator('label').filter({ hasText: label }).locator('..');
}

async function choose(
  page: Page,
  scope: Locator,
  label: string,
  value: string,
) {
  const item = scope.locator('.ant-form-item').filter({
    has: page.locator('.ant-form-item-label').getByText(label, { exact: true }),
  });
  await item.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(new RegExp(`^${value}(?:\\s|$)`))
    .click();
}

async function upload(page: Page, input: Locator, name: string) {
  const response = page.waitForResponse(
    (r) => r.url().includes('/upload') && r.request().method() === 'POST',
  );
  await input.setInputFiles({ name, mimeType: 'image/png', buffer: png });
  const res = await response;
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.code).toBe(0);
}

/** Submits the public incoming entry exactly as an operator would. */
async function submitIncomingRequest(page: Page, marker: string) {
  await page.goto('/qms/inspection/requests/incoming-entry');
  const form = page
    .locator('.inspection-request-entry-page')
    .or(page.locator('main'));
  const scope = (await form.first().isVisible())
    ? form.first()
    : page.locator('body');
  await choose(page, scope, '工单号', 'E2E-WO-001');
  await page.keyboard.press('Escape');
  await choose(page, scope, '进货类型', 'E2E Fabrication');
  await page.keyboard.press('Escape');
  const partItem = scope.locator('.ant-form-item').filter({
    has: page
      .locator('.ant-form-item-label')
      .getByText('物料名称', { exact: true }),
  });
  await partItem.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText('BOM · E2E Canonical Part', { exact: true })
    .click();
  await choose(page, scope, '责任归属类型', '供应商');
  await choose(page, scope, '供应商', 'E2E Supplier');
  await page.getByRole('spinbutton').fill('3');
  await page.getByPlaceholder('请输入报检人').fill('E2E Reporter');
  await page.getByPlaceholder('请输入补充说明').fill(marker);
  await upload(
    page,
    page.locator('input[type=file]').last(),
    `${marker}-self.png`,
  );
  const response = page.waitForResponse(
    (r) => r.url().includes('/requests/v2') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交报检', exact: true }).click();
  const res = await response;
  const body = await res.json();
  expect(body.code, body.message).toBe(0);
  expect(body.data.category).toBe('INCOMING');
  expect(body.data.supplierId).toBe(fixture.supplierId);
  return body.data as { id: string; requestNo: string };
}

/** The board counts pending incoming rows; FAIL rows belong to the fail bucket. */
async function pendingIncomingCount() {
  const rows = await db.qms_inspection_requests.findMany({
    where: {
      OR: [
        { category: 'INCOMING' },
        { category: null, processName: '进货检验' },
      ],
      isDeleted: false,
      status: { in: ['SUBMITTED', 'DISPATCHED', 'INSPECTING'] },
    },
    select: { inspectionResult: true },
  });
  return rows.filter((row) => row.inspectionResult !== 'FAIL').length;
}

async function submittedInRange(period: 'month' | 'year') {
  const { start, end } = shanghaiRange(period);
  return db.qms_inspection_requests.count({
    where: {
      isDeleted: false,
      status: { not: 'CANCELLED' },
      submittedAt: { gte: start, lt: end },
    },
  });
}

/** Creates a record through the real API as a non-tested precondition row. */
async function createRecordPrecondition(
  page: Page,
  token: string,
  marker: string,
  category: 'INCOMING' | 'PROCESS',
) {
  const payload =
    category === 'INCOMING'
      ? {
          category,
          hasDocuments: true,
          incomingType: 'E2E Incoming',
          inspectionDate: today(),
          inspector: 'E2E QC',
          materialName: marker,
          quantity: 3,
          remarks: marker,
          result: 'PASS',
          supplierId: fixture.supplierId,
          workOrderNumber: 'E2E-WO-001',
        }
      : {
          category,
          inspectionDate: today(),
          inspector: 'E2E QC',
          level1Component: 'E2E Canonical Part',
          level2Component: marker,
          processName: 'E2E Fabrication',
          quantity: 2,
          remarks: marker,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: fixture.departmentId,
          result: 'PASS',
          workOrderNumber: 'E2E-WO-001',
        };
  const response = await page.request.post(
    `${origin}/api/qms/inspection/records`,
    {
      data: payload,
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': `e2e-inspection-management-${marker}`,
      },
    },
  );
  const body = await response.json();
  writeFileSync(
    `${directory}/inspection-record-create-${marker}.json`,
    JSON.stringify({ status: response.status(), body }, null, 2),
  );
  expect(response.status(), body.message).toBe(200);
  expect(body.code, body.message).toBe(0);
  return db.inspections.findUniqueOrThrow({ where: { id: body.data.id } });
}

test('inspection today-incoming board reflects a UI-submitted incoming request for anonymous viewers', async ({
  page,
}) => {
  const marker = `E2E-TODAY-${fixture.runId.slice(0, 6)}`;
  // The public entry is an anonymous desktop route: no login cookie is set.
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const request = await submitIncomingRequest(page, marker);
  const stored = await db.qms_inspection_requests.findUniqueOrThrow({
    where: { id: request.id },
  });
  expect(stored.status).toBe('SUBMITTED');
  expect(stored.reporterId).toBeNull();
  expect(stored.reporter).toBe('E2E Reporter');
  expect(stored.supplierId).toBe(fixture.supplierId);

  const expectedPending = await pendingIncomingCount();
  await page.goto('/qms/inspection/today-incoming');
  await expect(
    page.getByRole('heading', { name: '今日外购件检验情况' }),
  ).toBeVisible();
  const pendingCard = page
    .getByText('待检验', { exact: true })
    .first()
    .locator('xpath=..')
    .locator('.text-2xl');
  await expect(pendingCard).toHaveText(String(expectedPending));

  const pendingBucket = page
    .locator('section')
    .filter({ hasText: '已报检 / 待检验' })
    .first();
  await expect(pendingBucket).toBeVisible();
  const item = pendingBucket
    .locator('li')
    .filter({ hasText: request.requestNo });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('E2E Canonical Part');
  await expect(item).toContainText('E2E Supplier');
  await expect(item).toContainText('E2E-WO-001');
  // The public board masks reporter names to a single visible character.
  await expect(item).toContainText('E*');
  writeFileSync(
    `${directory}/today-incoming-board.json`,
    JSON.stringify(
      {
        expectedPending,
        requestNo: request.requestNo,
        stored,
      },
      null,
      2,
    ),
  );
});

test('inspection dashboard period filter aggregates the isolated request data through the real UI', async ({
  page,
}) => {
  await login(page, '/qms/inspection/dashboard');
  const marker = `E2E-DASH-${fixture.runId.slice(0, 6)}`;
  await submitIncomingRequest(page, marker);

  const monthRequest = page.waitForResponse((r) =>
    r.url().includes('/inspection/requests/stats'),
  );
  await page.goto('/qms/inspection/dashboard');
  const first = await monthRequest;
  expect(first.url()).toContain('period=month');
  await expect(page.getByRole('heading', { name: '报检看板' })).toBeVisible();
  await expect(
    page.getByText('本月报检、复检和检验效率统计', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('每日报检数量', { exact: true })).toBeVisible();

  const submittedCard = page
    .getByText('报检数量', { exact: true })
    .first()
    .locator('xpath=..')
    .locator('.text-3xl');
  const expectedMonth = await submittedInRange('month');
  await expect(submittedCard).toHaveText(String(expectedMonth));

  const yearRequest = page.waitForResponse(
    (r) =>
      r.url().includes('/inspection/requests/stats') &&
      r.url().includes('period=year'),
  );
  await page.locator('.ant-segmented-item').filter({ hasText: '本年' }).click();
  const yearRes = await yearRequest;
  const yearStats = await yearRes.json();
  expect(yearStats.code, yearStats.message).toBe(0);
  expect(yearStats.data.todaySubmittedCount).toBeGreaterThanOrEqual(
    expectedMonth,
  );
  expect(Array.isArray(yearStats.data.dailyTrend)).toBe(true);
  expect(yearStats.data.dailyTrend.length).toBeGreaterThan(0);
  expect(Array.isArray(yearStats.data.historyByInspector)).toBe(true);
  expect(Array.isArray(yearStats.data.bySupplier)).toBe(true);
  await expect(
    page.getByText('本年报检、复检和检验效率统计', { exact: true }),
  ).toBeVisible();
  await expect(submittedCard).toHaveText(
    String(yearStats.data.todaySubmittedCount),
  );

  // 检验效率 history view renders real inspector rows for the same period.
  await page
    .locator('.ant-segmented-item')
    .filter({ hasText: '检验效率' })
    .click();
  const historyCard = page
    .locator('.ant-card')
    .filter({ hasText: '历史统计' })
    .first();
  await expect(historyCard).toBeVisible();
  // The efficiency view renders real inspector rows, or the explicit empty
  // state when no inspection task was ever closed. There is no column header.
  const historyInspectors = yearStats.data.historyByInspector as Array<{
    inspector: string;
  }>;
  if (historyInspectors.length > 0) {
    for (const row of historyInspectors.slice(0, 3)) {
      await expect(
        historyCard.getByText(row.inspector, { exact: true }).first(),
      ).toBeVisible();
    }
  } else {
    await expect(
      historyCard.getByText('暂无历史统计数据', { exact: true }),
    ).toBeVisible();
  }
  writeFileSync(
    `${directory}/inspection-dashboard-stats.json`,
    JSON.stringify(
      {
        bySupplierCount: yearStats.data.bySupplier.length,
        expectedMonth,
        historyByInspectorCount: yearStats.data.historyByInspector.length,
        marker,
        periodSubmittedCount: yearStats.data.todaySubmittedCount,
      },
      null,
      2,
    ),
  );
});

test('inspection records tabs, filters, detail drawer and scoped export match persisted rows', async ({
  page,
}) => {
  const token = await login(page, records);
  const incomingMarker = `E2E-REC-IN-${fixture.runId.slice(0, 6)}`;
  const processMarker = `E2E-REC-PR-${fixture.runId.slice(0, 6)}`;
  const incoming = await createRecordPrecondition(
    page,
    token,
    incomingMarker,
    'INCOMING',
  );
  const process = await createRecordPrecondition(
    page,
    token,
    processMarker,
    'PROCESS',
  );
  expect(incoming.category).toBe('INCOMING');
  expect(incoming.supplierId).toBe(fixture.supplierId);
  expect(process.category).toBe('PROCESS');
  expect(process.level2Component).toBe(processMarker);

  await page.goto(records);
  await expect(page.locator('.vxe-table').first()).toBeVisible();
  await expect(page.locator('.vxe-body--row').first()).toBeVisible();

  const filterByMaterial = async (label: string, value: string) => {
    await page.getByPlaceholder(label, { exact: true }).first().fill(value);
    const response = page.waitForResponse(
      (r) =>
        r.url().includes('/inspection/records') &&
        r.request().method() === 'GET',
    );
    await page
      .getByRole('button', { name: '查询', exact: true })
      .first()
      .click();
    await response;
  };

  const row = (text: string) =>
    page.locator('tr.vxe-body--row').filter({ hasText: text }).first();

  await filterByMaterial('物料名称', incomingMarker);
  const incomingRow = row(incomingMarker);
  await expect(incomingRow).toHaveCount(1);
  await incomingRow.getByText(incomingMarker, { exact: true }).first().click();
  const drawer = page.locator('.ant-drawer-content:visible').first();
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByText('检验记录详情', { exact: true }).first(),
  ).toBeVisible();
  await expect(drawer).toContainText('E2E-WO-001');
  await expect(drawer).toContainText(incomingMarker);
  await expect(drawer).toContainText('E2E Supplier');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await page
    .locator('.ant-segmented-item')
    .filter({ hasText: '过程检验' })
    .click();
  await filterByMaterial('组件名称', processMarker);
  const processRow = row(processMarker);
  await expect(processRow).toHaveCount(1);
  await expect(processRow).toContainText('E2E Fabrication');
  await processRow.getByText(processMarker, { exact: true }).first().click();
  const processDrawer = page.locator('.ant-drawer-content:visible').first();
  await expect(processDrawer).toBeVisible();
  await expect(processDrawer).toContainText(processMarker);
  await page.keyboard.press('Escape');
  await expect(processDrawer).toBeHidden();

  // Scoped export returns exactly the filtered rows for this isolated run.
  const exportIncoming = await page.request.get(
    `${origin}/api/qms/inspection/records/export`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { materialName: incomingMarker, type: 'INCOMING' },
    },
  );
  const incomingExport = await exportIncoming.json();
  expect(exportIncoming.status()).toBe(200);
  expect(incomingExport.code).toBe(0);
  expect(
    incomingExport.data.items.map((item: { id: string }) => item.id),
  ).toEqual([incoming.id]);

  const exportProcess = await page.request.get(
    `${origin}/api/qms/inspection/records/export`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { componentName: processMarker, type: 'PROCESS' },
    },
  );
  const processExport = await exportProcess.json();
  expect(processExport.code).toBe(0);
  expect(
    processExport.data.items.map((item: { id: string }) => item.id),
  ).toEqual([process.id]);
  writeFileSync(
    `${directory}/inspection-records-export.json`,
    JSON.stringify(
      {
        incoming: incomingExport.data.items.map(
          (item: { id: string; serialNumber: null | string }) => ({
            id: item.id,
            serialNumber: item.serialNumber,
          }),
        ),
        process: processExport.data.items.map(
          (item: { id: string; serialNumber: null | string }) => ({
            id: item.id,
            serialNumber: item.serialNumber,
          }),
        ),
      },
      null,
      2,
    ),
  );
});

test('inspection records reader and foreign scope keep denied writes and cross-department reads out', async ({
  page,
}) => {
  const token = await login(page, records);
  const marker = `E2E-REC-DENY-${fixture.runId.slice(0, 6)}`;
  const record = await createRecordPrecondition(
    page,
    token,
    marker,
    'INCOMING',
  );
  const before = await db.inspections.findUniqueOrThrow({
    where: { id: record.id },
  });

  const readerToken = await login(page, records, '_reader');
  await page.goto(records);
  await expect(page.locator('.vxe-table').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: '新增', exact: true }),
  ).toHaveCount(0);

  const denied = async (
    method: 'delete' | 'put',
    path: string,
    data?: object,
  ) => {
    const response = await page.request[method](
      `${origin}/api/qms/inspection/records/${path}`,
      {
        data,
        headers: { Authorization: `Bearer ${readerToken}` },
      },
    );
    const body = await response.json();
    writeFileSync(
      `${directory}/inspection-record-denial-${method}.json`,
      JSON.stringify({ status: response.status(), body }, null, 2),
    );
    expect(response.status(), body.message).toBe(403);
    expect(body.code).not.toBe(0);
  };
  await denied('put', record.id, { remarks: `${marker}-denied` });
  await denied('delete', record.id);
  await denied('put', 'record-that-does-not-exist', { remarks: marker });

  const exportDenied = await page.request.get(
    `${origin}/api/qms/inspection/records/export`,
    {
      headers: { Authorization: `Bearer ${readerToken}` },
      params: { type: 'INCOMING' },
    },
  );
  expect(exportDenied.status()).toBe(403);

  // A schema violation is a client error, never a 500 or a silent write.
  const invalidExport = await page.request.get(
    `${origin}/api/qms/inspection/records/export`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { bogusParameter: '1', type: 'INCOMING' },
    },
  );
  const invalidBody = await invalidExport.json();
  expect(invalidExport.status()).toBe(400);
  expect(invalidBody.code).not.toBe(0);

  const after = await db.inspections.findUniqueOrThrow({
    where: { id: record.id },
  });
  expect(after).toEqual(before);

  // Foreign-department identity reads are scoped to empty, not a full listing.
  // The foreign identity has no inspection-records permission, so the desktop
  // route itself is not reachable; the API assertion still runs with its token.
  const foreignToken = await login(page, records, '_foreign', false);
  const foreignList = await page.request.get(
    `${origin}/api/qms/inspection/records`,
    {
      headers: { Authorization: `Bearer ${foreignToken}` },
      params: { materialName: marker, type: 'INCOMING' },
    },
  );
  const foreignBody = await foreignList.json();
  expect(foreignList.status()).toBe(200);
  expect(
    foreignBody.data.items.filter(
      (item: { id: string }) => item.id === record.id,
    ),
  ).toEqual([]);
  writeFileSync(
    `${directory}/inspection-record-scope.json`,
    JSON.stringify(
      {
        foreignItems: foreignBody.data.items.length,
        recordId: record.id,
        unchanged: after,
      },
      null,
      2,
    ),
  );
});
