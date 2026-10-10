import type { Locator, Page } from '@playwright/test';

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

import { expect, test } from '@playwright/test';

import { assertOwnedTargets } from '../../../scripts/e2e/safety.mjs';
import { remainingDedupeWait, waitOutDedupeWindow } from './dedupe-window';

const directory = process.env.QGS_E2E_ARTIFACT_DIR;
const fixture = JSON.parse(readFileSync(`${directory}/seed.json`, 'utf8'));
const require = createRequire(
  new URL('../../backend/package.json', import.meta.url),
);
const { PrismaClient } = require('@prisma/client');

let db: InstanceType<typeof PrismaClient>;
const api = `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/supplier`;
const lastLogin = new Map<string, number>();
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6K/8AAAAASUVORK5CYII=',
  'base64',
);

test.beforeAll(async () => {
  await assertOwnedTargets(process.env);
  expect(fixture.runId).toBe(process.env.QGS_E2E_RUN_ID);
  expect(
    fixture.supplierBeforeUI.map((row: { id: string }) => row.id).sort(),
  ).toEqual([fixture.supplierId, fixture.outsourcingId].sort());
  db = new PrismaClient();
});
test.afterAll(async () => db?.$disconnect());
test.beforeEach(async ({ page }, info) => {
  await page.addLocatorHandler(
    page
      .locator('.inspection-request-global-alert')
      .getByRole('button', { name: '标记已读' }),
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
    path: `${directory}/supplier-${info.status}-${info.testId}.png`,
    mask: [page.locator('input'), page.locator('textarea')],
  });
});

async function login(page: Page, category = 'Supplier', suffix = '') {
  const remaining = remainingDedupeWait(lastLogin.get(suffix));
  if (remaining > 0) await page.waitForTimeout(remaining);
  const target = category === 'Supplier' ? '/qms/supplier' : '/qms/outsourcing';
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
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  await expect(page.locator('.vxe-table').first()).toBeVisible();
  return result.data.accessToken as string;
}

function field(modal: Locator, label: string) {
  return modal
    .locator('label')
    .filter({ hasText: new RegExp(`^\\s*\\*?\\s*${label}\\s*$`) })
    .locator('..');
}
async function pickToday(page: Page, modal: Locator, label: string) {
  const picker = field(modal, label).locator('.ant-picker');
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
  return selectedDate;
}
async function action(page: Page, id: string, name: 'delete' | 'edit') {
  const button = page
    .locator(`.vxe-table--fixed-right-wrapper tr[rowid="${id}"]`)
    .locator(`[data-action="${name}"]`);
  await expect(button).toBeVisible();
  await button.click();
}
async function fill(
  page: Page,
  name: string,
  category = 'Supplier',
  mode = 'EXTERNAL_PROCESSOR',
) {
  await page
    .getByRole('button', {
      name: category === 'Supplier' ? /新增供应商/ : /新增外协单位/,
    })
    .click();
  const modal = page
    .getByRole('dialog')
    .filter({ has: page.locator('input[type="file"]') });
  await expect(modal).toBeVisible();
  const labels =
    category === 'Supplier'
      ? ['供应商名称', '品牌', '主营产品', '采购员', '厂商性质']
      : ['单位名称', '服务范围', '主要加工内容', '负责人'];
  const values = [
    name,
    'E2E Governance Brand',
    'E2E Governance Product',
    'E2E Production',
    'E2E Manufacturer',
  ];
  for (const [index, label] of labels.entries())
    await field(modal, label).locator('input').fill(values[index]);
  if (category === 'Outsourcing') {
    await field(modal, '管理类型').locator('.ant-select').click();
    const label = {
      IN_HOUSE_TEAM: '驻厂队伍',
      EXTERNAL_PROCESSOR: '外部加工',
      EXTERNAL_SERVICE: '外部服务',
    }[mode];
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(label || '', { exact: true })
      .click();
  }
  const date = await pickToday(page, modal, '认定时间');
  const upload = page.waitForResponse(
    (r) => r.url().includes('/upload') && r.request().method() === 'POST',
  );
  await modal
    .locator('input[type="file"]')
    .setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: png });
  const upRes = await upload;
  expect(upRes.status()).toBe(200);
  await expect(modal.locator('.ant-upload-list-item-done')).toHaveCount(1);
  return { modal, date };
}
async function submit(
  page: Page,
  modal: Locator,
  method = 'POST',
  id = '',
  expected = 200,
) {
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/qms/supplier${id ? `/${id}` : ''}` &&
      r.request().method() === method,
  );
  await modal.getByRole('button', { name: /确\s*认/ }).click();
  const res = await response;
  const body = await res.json();
  expect(res.status(), body.message).toBe(expected);
  if (expected === 200) {
    expect(body.code, body.message).toBe(0);
    await expect(modal).toBeHidden();
  }
  return body;
}
async function state(id: string, stage: string) {
  const snapshot = {
    supplier: await db.suppliers.findUniqueOrThrow({ where: { id } }),
    references: await db.file_references.findMany({
      where: { bizId: id, bizType: 'supplier' },
      orderBy: { id: 'asc' },
    }),
    jobs: await db.metric_refresh_jobs.findMany({
      where: { entityId: id },
      orderBy: { id: 'asc' },
    }),
    links: await db.supplier_identity_links.findMany({
      where: { supplierId: id },
    }),
  };
  writeFileSync(
    `${directory}/supplier-state-${stage}-${id}.json`,
    JSON.stringify(snapshot, null, 2),
  );
  return snapshot;
}
async function create(
  page: Page,
  name: string,
  category = 'Supplier',
  mode = 'EXTERNAL_PROCESSOR',
) {
  const before = await db.suppliers.count();
  expect(await db.suppliers.count({ where: { name } })).toBe(0);
  const { modal, date } = await fill(page, name, category, mode);
  const body = await submit(page, modal);
  expect(await db.suppliers.count()).toBe(before + 1);
  const createdState = await state(body.data.id, 'created');
  const stored = createdState.supplier;
  expect(stored).toMatchObject({
    name,
    category,
    buyer: 'E2E Production',
    status: 'Qualified',
    isDeleted: false,
    version: 1,
  });
  // AntD DatePicker stores local midnight; persisted UTC shifts a full day at UTC+8.
  const recognized = new Date(stored.recognizedAt.getTime() + 8 * 3600 * 1000);
  expect(recognized.toISOString().slice(0, 10)).toBe(date);
  // Governed write dual-writes canonical IDs when dictionaries exist; ad-hoc names are stored as valid raw fields.
  expect(stored.name).toBe(name);
  expect(stored.productName).toBe('E2E Governance Product');
  const snapshot = await state(stored.id, 'admitted');
  expect(snapshot.references).toHaveLength(1);
  expect(
    snapshot.jobs.some(
      (job: { reason: string }) => job.reason === 'supplier.created',
    ),
  ).toBe(true);
  return stored;
}
async function edit(
  page: Page,
  stored: { id: string; name: string },
  value: string,
) {
  await action(page, stored.id, 'edit');
  const modal = page
    .getByRole('dialog')
    .filter({ has: page.locator('input[type="file"]') });
  await field(modal, '品牌').locator('input').fill(value);
  await submit(page, modal, 'PUT', stored.id);
}
async function remove(page: Page, stored: { id: string; name: string }) {
  await action(page, stored.id, 'delete');
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/qms/supplier/${stored.id}` &&
      r.request().method() === 'DELETE',
  );
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /确\s*定/ })
    .click();
  const delRes = await response;
  expect(delRes.status()).toBe(200);
  const delState = await state(stored.id, 'deleted');
  expect(delState.supplier.isDeleted).toBe(true);
}
function marker(label: string) {
  return `E2E-GOV-${fixture.runId}-${label}`;
}

test('supplier UI admission lifecycle edits deletes and restores the original identity', async ({
  page,
}) => {
  await login(page);
  const stored = await create(page, marker('lifecycle'));
  await edit(page, stored, 'E2E Edited Brand');
  const editedState = await state(stored.id, 'edited');
  expect(editedState.supplier).toMatchObject({
    brand: 'E2E Edited Brand',
    version: 2,
  });
  await page.reload();
  await page.getByText(stored.name, { exact: true }).first().click();
  await expect(
    page.getByText('E2E Edited Brand', { exact: true }).last(),
  ).toBeVisible();
  await page.goto('/qms/supplier');
  await remove(page, stored);
  const before = await db.suppliers.count();
  const { modal } = await fill(page, stored.name);
  const restored = await submit(page, modal);
  expect(restored.data.id).toBe(stored.id);
  expect(await db.suppliers.count()).toBe(before);
  const snapshot = await state(stored.id, 'restored');
  expect(snapshot.supplier.isDeleted).toBe(false);
  expect(
    snapshot.jobs.some(
      (job: { reason: string }) => job.reason === 'supplier.restored',
    ),
  ).toBe(true);
});

for (const mode of [
  'EXTERNAL_PROCESSOR',
  'IN_HOUSE_TEAM',
  'EXTERNAL_SERVICE',
]) {
  test(`outsourcing UI ${mode} admission preserves category and identity policy`, async ({
    page,
  }) => {
    const token = await login(page, 'Outsourcing');
    const stored = await create(page, marker(mode), 'Outsourcing', mode);
    expect(stored.outsourcingMode).toBe(mode);
    await page.reload();
    await page.getByText(stored.name, { exact: true }).first().click();
    await expect(
      page.getByText(stored.name, { exact: true }).last(),
    ).toBeVisible();
    const history = await page.request.get(
      `${api}/${stored.id}/inspection-history`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(history.status()).toBe(200);
    const body = await history.json();
    expect(body.code).toBe(0);
    expect(body.data.items).toEqual([]);
    expect(['INCOMING', 'PROCESS']).toContain(body.data.source);
    const policyState = await state(stored.id, 'policy');
    expect(policyState.links).toEqual([]);
    await page.goto('/qms/outsourcing');
    await remove(page, stored);
  });
}

test('supplier role and department deny writes and preserve scoped data', async ({
  page,
}) => {
  await login(page);
  const stored = await create(page, marker('permissions'));
  const before = await state(stored.id, 'before-denial');
  const readerToken = await login(page, 'Supplier', '_reader');
  await expect(
    page.getByText(stored.name, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '新增供应商', exact: true }),
  ).toHaveCount(0);
  for (const method of ['PUT', 'DELETE']) {
    const denied = await page.request.fetch(
      `${api}/${stored.id}?version=${stored.version}`,
      {
        method,
        headers: { Authorization: `Bearer ${readerToken}` },
        ...(method === 'PUT'
          ? { data: { version: stored.version, brand: 'ILLEGAL' } }
          : {}),
      },
    );
    expect(denied.status()).toBe(403);
  }
  const foreignToken = await login(page, 'Supplier', '_foreign');
  await expect(page.getByText(stored.name, { exact: true })).toHaveCount(0);
  const denied = await page.request.put(`${api}/${stored.id}`, {
    headers: { Authorization: `Bearer ${foreignToken}` },
    data: { version: stored.version, brand: 'ILLEGAL' },
  });
  expect(denied.status()).toBe(404);
  expect(await state(stored.id, 'after-denial')).toEqual(before);
});

test('supplier versions reject missing stale and concurrent edits without lost updates', async ({
  page,
}) => {
  const token = await login(page);
  const stored = await create(page, marker('version'));
  const headers = { Authorization: `Bearer ${token}` };
  const before = await state(stored.id, 'before-missing-version');
  const missingRes = await page.request.put(`${api}/${stored.id}`, {
    headers,
    data: { brand: 'ILLEGAL' },
  });
  expect(missingRes.status()).toBe(400);
  expect(await state(stored.id, 'after-missing-version')).toEqual(before);
  await edit(page, stored, 'E2E Version Two');
  const staleRes = await page.request.put(`${api}/${stored.id}`, {
    headers,
    data: { version: 1, brand: 'STALE' },
  });
  expect(staleRes.status()).toBe(409);
  const current = await state(stored.id, 'before-race');
  const results = await Promise.all(
    ['E2E Race A', 'E2E Race B'].map((brand) =>
      page.request.put(`${api}/${stored.id}`, {
        headers,
        data: { version: 2, brand },
      }),
    ),
  );
  expect(results.map((res) => res.status()).sort()).toEqual([200, 409]);
  const final = await state(stored.id, 'after-race');
  expect(final.supplier.version).toBe(3);
  expect(final.supplier.brand).toBe(
    results[0].status() === 200 ? 'E2E Race A' : 'E2E Race B',
  );
  expect(final.jobs.length).toBe(current.jobs.length + 1);
});

test('supplier committed response loss retry and duplicate concurrent names never create a second identity', async ({
  page,
}) => {
  const token = await login(page);
  const name = marker('retry');
  const { modal } = await fill(page, name);
  let committed: Record<string, unknown> | undefined;
  await page.route('**/api/qms/supplier', async (route) => {
    if (route.request().method() !== 'POST' || committed)
      return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const resJson = await response.json();
    committed = resJson.data;
    await route.abort('failed');
  });
  await modal.getByRole('button', { name: /确\s*认/ }).click();
  await expect.poll(() => Boolean(committed)).toBe(true);
  await expect(modal.getByRole('button', { name: /确\s*认/ })).toBeEnabled();
  const stored = await db.suppliers.findUniqueOrThrow({ where: { name } });
  const before = await state(stored.id, 'committed');
  await waitOutDedupeWindow(page);
  await submit(page, modal, 'POST', '', 409);
  expect(await db.suppliers.count({ where: { name } })).toBe(1);
  expect(await state(stored.id, 'retried')).toEqual(before);
  const raceName = marker('duplicate-race');
  const payload = {
    name: raceName,
    category: 'Supplier',
    buyer: 'E2E Production',
  };
  // Rejection probing complements UI admission; it is not a second success-flow substitute.
  const results = await Promise.all(
    [0, 1].map(() =>
      page.request.post(api, {
        headers: { Authorization: `Bearer ${token}` },
        data: payload,
      }),
    ),
  );
  expect(results.filter((res) => res.status() === 200)).toHaveLength(1);
  expect(
    results.filter((res) => [409, 429].includes(res.status())),
  ).toHaveLength(1);
  expect(await db.suppliers.count({ where: { name: raceName } })).toBe(1);
});

test('outsourcing-only manager governs its UI category and cannot mutate ordinary suppliers', async ({
  page,
}) => {
  await login(page, 'Outsourcing', '_outsourcing');
  const stored = await create(page, marker('outsourcing-only'), 'Outsourcing');
  await action(page, stored.id, 'edit');
  const modal = page
    .getByRole('dialog')
    .filter({ has: page.locator('input[type="file"]') });
  await field(modal, '服务范围')
    .locator('input')
    .fill('E2E Outsourcing Edited');
  await submit(page, modal, 'PUT', stored.id);
  const outState = await state(stored.id, 'outsourcing-edited');
  expect(outState.supplier.brand).toBe('E2E Outsourcing Edited');
  await remove(page, stored);
  const before = await state(fixture.supplierId, 'ordinary-before');
  const token = await login(page, 'Outsourcing', '_outsourcing');
  const denied = await page.request.put(`${api}/${fixture.supplierId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      version: before.supplier.version,
      category: 'Outsourcing',
      brand: 'ILLEGAL',
    },
  });
  expect(denied.status()).toBe(403);
  expect(await state(fixture.supplierId, 'ordinary-after')).toEqual(before);
});
