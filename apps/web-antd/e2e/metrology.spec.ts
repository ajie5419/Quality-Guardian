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
const browserErrors = new WeakMap<Page, string[]>();
const api = `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms`;
const token = process.env.METROLOGY_PUBLIC_BORROW_TOKEN;
const ledger = '/qms/metrology/ledger';
const plans = '/qms/metrology/calibration-plan';
const borrow = '/qms/metrology/borrow';

test.beforeAll(async () => {
  await assertOwnedTargets(process.env);
  expect(fixture.runId).toBe(process.env.QGS_E2E_RUN_ID);
  expect(fixture.metrologyBeforeUI).toEqual({
    instruments: 0,
    borrows: 0,
    plans: 0,
  });
  expect(Boolean(token)).toBe(true);
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
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await info.attach('error-context', {
    body: Buffer.from('Input snapshots suppressed; see masked screenshot.'),
    contentType: 'text/plain',
  });
});
test.afterEach(async ({ page }, info) => {
  const messages = JSON.stringify(
    {
      errors: browserErrors.get(page),
      menus: await db.menus.findMany({
        where: { path: { startsWith: '/qms/metrology' } },
        select: { id: true, name: true, path: true, parentId: true },
      }),
    },
    null,
    2,
  );
  writeFileSync(
    `${directory}/metrology-runtime-${info.testId}.json`,
    messages.replaceAll(token || '[not configured]', '[REDACTED]'),
  );
  await page.screenshot({
    path: `${directory}/metrology-${info.status}-${info.testId}.png`,
    mask: [page.locator('input')],
  });
});

async function login(page: Page, target = ledger, suffix = '') {
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
  const submit = page
    .getByRole('button', { name: /登\s*录/ })
    .or(page.locator('button[aria-label="login"]'));
  // The backend dedupes identical anonymous POST /auth/login bodies inside its
  // dedupe window, so a login issued shortly after another spec's login of the
  // same account returns HTTP 409 (code -1). Retry only that conflict; real
  // auth failures (403) still fail the test immediately.
  let body: { code: number; data?: unknown; message?: string } = { code: -1 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
    );
    await submit.click();
    const loginResponse = await response;
    body = await loginResponse.json();
    if (loginResponse.status() !== 409) break;
    await waitOutDedupeWindow(page);
  }
  expect(body.code, body.message).toBe(0);
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  await expect(page.locator('.vxe-table').first()).toBeVisible();
  return (body.data as { accessToken: string }).accessToken;
}

function field(page: Page, container: Locator, label: string) {
  return container.locator('.ant-form-item').filter({
    has: page.locator('.ant-form-item-label').getByText(label, { exact: true }),
  });
}

async function save(page: Page, path: string, method = 'POST') {
  const response = page.waitForResponse(
    (r) => r.url().endsWith(path) && r.request().method() === method,
  );
  const modal = page.locator('.ant-modal:visible');
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  const res = await response;
  const body = await res.json();
  expect(res.status(), body.message).toBe(200);
  expect(body.code, body.message).toBe(0);
  await expect(modal).toBeHidden();
  return body.data;
}

async function instrument(
  page: Page,
  code: string,
  status = 'VALID',
  date = '2099-12-31',
) {
  if (!page.url().endsWith(ledger)) await page.goto(ledger);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const modal = page.locator('.ant-modal:visible');
  await field(page, modal, '量具名称')
    .locator('input')
    .fill(`E2E Gauge ${code}`);
  await field(page, modal, '编号').locator('input').fill(code);
  await field(page, modal, '型号').locator('input').fill('E2E Model');
  await field(page, modal, '使用单位').locator('input').fill('E2E Production');
  await field(page, modal, '有效期').locator('input').fill(date);
  if (status === 'DISABLED') {
    await field(page, modal, '检验状态').locator('.ant-select').click();
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('停用', { exact: true })
      .click();
  }
  const before = await db.measuring_instruments.count();
  const result = await save(page, '/api/qms/metrology');
  expect(await db.measuring_instruments.count()).toBe(before + 1);
  const stored = await db.measuring_instruments.findUniqueOrThrow({
    where: { id: result.id },
  });
  expect(stored.instrumentCode).toBe(code);
  expect(stored.borrowStatus).toBe('AVAILABLE');
  expect(stored.usingUnit).toBe('E2E Production');
  expect(stored.isDeleted).toBe(false);
  return stored;
}

async function state(id: string, label: string) {
  const result = {
    instrument: await db.measuring_instruments.findUniqueOrThrow({
      where: { id },
    }),
    borrows: await db.metrology_borrow_records.findMany({
      where: { instrumentId: id },
      orderBy: { id: 'asc' },
    }),
    plans: await db.metrology_calibration_plans.findMany({
      where: { instrumentId: id },
      orderBy: { id: 'asc' },
    }),
  };
  writeFileSync(
    `${directory}/metrology-${label}-${id}.json`,
    JSON.stringify(result, null, 2),
  );
  return result;
}

async function row(page: Page, code: string) {
  const result = page
    .locator('.vxe-table--main-wrapper tr.vxe-body--row:visible')
    .filter({ hasText: code });
  await expect(result).toHaveCount(1);
  return result;
}

async function action(page: Page, code: string, label: string) {
  const visibleRow = await row(page, code);
  const id = await visibleRow.getAttribute('rowid');
  const fixed = page
    .locator(`.vxe-table--fixed-right-wrapper tr[rowid="${id}"]`)
    .getByRole('button', { name: label, exact: true });
  const regular = page
    .locator(`.vxe-table--main-wrapper tr[rowid="${id}"]`)
    .getByRole('button', { name: label, exact: true });
  await ((await fixed.isVisible()) ? fixed : regular).click();
}

async function entry(page: Page, code: string) {
  await page.goto(
    `/qms/metrology/borrow/entry?keyword=${encodeURIComponent(code)}&token=${token}`,
  );
  await expect(page.locator('.ant-descriptions')).toContainText(code);
}

async function borrowUI(
  page: Page,
  item: { id: string; instrumentCode: string },
) {
  await entry(page, item.instrumentCode);
  const form = page.locator('.ant-form:visible');
  await field(page, form, '借用部门').locator('input').fill('E2E Production');
  await field(page, form, '借用人').locator('input').fill('E2E Reporter');
  const date = await field(page, form, '借用日期')
    .locator('input')
    .inputValue();
  const count = await db.metrology_borrow_records.count();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/public/metrology/borrow') &&
      r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '确认借用', exact: true }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.code).toBe(0);
  expect(await db.metrology_borrow_records.count()).toBe(count + 1);
  const s = await state(item.id, 'borrowed');
  expect(s.instrument.borrowStatus).toBe('BORROWED');
  expect(s.borrows).toHaveLength(1);
  expect(s.borrows[0].status).toBe('BORROWED');
  expect(s.borrows[0].borrowerDepartmentId).toBe(fixture.departmentId);
  expect(s.borrows[0].borrowerNameId).toBe(fixture.metrologyBorrowerNameId);
  // Compare the business calendar day, not a timezone-dependent UTC slice.
  expect(s.borrows[0].borrowedAt.getFullYear()).toBe(Number(date.slice(0, 4)));
  expect(s.borrows[0].borrowedAt.getMonth() + 1).toBe(Number(date.slice(5, 7)));
  expect(s.borrows[0].borrowedAt.getDate()).toBe(Number(date.slice(8, 10)));
  return s.borrows[0];
}

async function requestReturnUI(
  page: Page,
  item: { id: string; instrumentCode: string },
  recordId: string,
) {
  await entry(page, item.instrumentCode);
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/public/metrology/borrow/${recordId}/return`),
  );
  await page.getByRole('button', { name: '申请归还', exact: true }).click();
  const received1 = await response;
  expect(received1.status()).toBe(200);
  const s = await state(item.id, 'return-pending');
  expect(s.instrument.borrowStatus).toBe('RETURN_PENDING');
  expect(s.borrows[0].status).toBe('RETURN_PENDING');
}

async function denial(
  page: Page,
  id: string,
  url: string,
  method: string,
  data: unknown,
  status: number,
  accessToken?: string,
) {
  const before = await state(id, 'denial-before');
  const res = await page.request.fetch(url, {
    method,
    data,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  const body = await res.json();
  writeFileSync(
    `${directory}/metrology-denial-${id}-${status}.json`,
    JSON.stringify({ status: res.status(), body }, null, 2),
  );
  expect(res.status(), body.message).toBe(status);
  expect(body.code).not.toBe(0);
  expect(await state(id, 'denial-after')).toEqual(before);
}

test('metrology ledger UI registers edits reopens and deletes with duplicate and date rejection', async ({
  page,
}) => {
  const accessToken = await login(page);
  const item = await instrument(page, 'E2E-M-LEDGER');
  await page.reload();
  await expect(await row(page, item.instrumentCode)).toContainText('E2E Model');
  await action(page, item.instrumentCode, '编辑');
  await field(page, page.locator('.ant-modal:visible'), '型号')
    .locator('input')
    .fill('E2E Revised');
  await save(page, `/api/qms/metrology/${item.id}`, 'PUT');
  await page.reload();
  await expect(await row(page, item.instrumentCode)).toContainText(
    'E2E Revised',
  );
  const edited = await state(item.id, 'edited');
  expect(edited.instrument.model).toBe('E2E Revised');
  expect(edited.instrument.validUntil).toEqual(item.validUntil);
  const count = await db.measuring_instruments.count();
  await denial(
    page,
    item.id,
    `${api}/metrology`,
    'POST',
    {
      instrumentCode: item.instrumentCode,
      instrumentName: item.instrumentName,
    },
    409,
    accessToken,
  );
  expect(await db.measuring_instruments.count()).toBe(count);
  await denial(
    page,
    item.id,
    `${api}/metrology/${item.id}`,
    'PUT',
    {
      instrumentCode: item.instrumentCode,
      instrumentName: item.instrumentName,
      validUntil: '2026-02-30',
    },
    400,
    accessToken,
  );
  await action(page, item.instrumentCode, '删除');
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/metrology/${item.id}`) &&
      r.request().method() === 'DELETE',
  );
  await page
    .locator('.ant-modal-confirm:visible')
    .getByRole('button', { name: /确\s*定/ })
    .click();
  const received2 = await response;
  expect(received2.status()).toBe(200);
  const deleted = await state(item.id, 'deleted');
  expect(deleted.instrument.isDeleted).toBe(true);
  await page.reload();
  await expect(
    page
      .locator('.vxe-table--main-wrapper tr.vxe-body--row')
      .filter({ hasText: item.instrumentCode }),
  ).toHaveCount(0);
});

test('metrology desktop borrow request and custodian confirmation preserve the two-stage state machine', async ({
  page,
}) => {
  const accessToken = await login(page);
  const item = await instrument(page, 'E2E-M-BORROW');
  const record = await borrowUI(page, item);
  const today = new Date().toISOString().slice(0, 10);
  await denial(
    page,
    item.id,
    `${api}/metrology/borrow/${record.id}/return`,
    'POST',
    { returnedAt: today },
    409,
    accessToken,
  );
  const available = await instrument(page, 'E2E-M-MIXED');
  const availableBefore = await state(available.id, 'mixed-before');
  await denial(
    page,
    item.id,
    `${api}/metrology/${item.id}`,
    'DELETE',
    undefined,
    409,
    accessToken,
  );
  await denial(
    page,
    item.id,
    `${api}/metrology/batch-delete`,
    'POST',
    { ids: [item.id, available.id] },
    409,
    accessToken,
  );
  expect(await state(available.id, 'mixed-after')).toEqual(availableBefore);
  await requestReturnUI(page, item, record.id);
  await denial(
    page,
    item.id,
    `${api}/public/metrology/borrow/${record.id}/return`,
    'POST',
    { token },
    409,
  );
  await login(page, borrow);
  await action(page, item.instrumentCode, '确认收到');
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/metrology/borrow/${record.id}/return`),
  );
  await page
    .locator('.ant-modal-confirm:visible')
    .getByRole('button', { name: /确\s*定/ })
    .click();
  const received3 = await response;
  expect(received3.status()).toBe(200);
  const returned = await state(item.id, 'returned');
  expect(returned.instrument.borrowStatus).toBe('AVAILABLE');
  expect(returned.borrows[0].status).toBe('RETURNED');
  expect(returned.borrows[0].returnedAt).not.toBeNull();
  await page.reload();
  await expect(await row(page, item.instrumentCode)).toContainText('已归还');
  await denial(
    page,
    item.id,
    `${api}/metrology/borrow/${record.id}/return`,
    'POST',
    { returnedAt: today },
    409,
    accessToken,
  );
});

test('metrology expired and disabled instruments block desktop borrow and invalid requests preserve data', async ({
  page,
}) => {
  await login(page);
  for (const [code, status, date] of [
    ['E2E-M-EXPIRED', 'VALID', '2020-01-01'],
    ['E2E-M-DISABLED', 'DISABLED', '2099-12-31'],
  ]) {
    const item = await instrument(page, code, status, date);
    await entry(page, code);
    await expect(
      page.getByRole('button', { name: '确认借用', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText('该量具当前不在可借用状态，不能发起借用。'),
    ).toBeVisible();
    await denial(
      page,
      item.id,
      `${api}/public/metrology/borrow`,
      'POST',
      {
        token,
        instrumentId: item.id,
        borrowedAt: '2026-10-09',
        borrowerName: 'E2E Reporter',
        borrowerDepartment: 'E2E Production',
      },
      400,
    );
  }
  const item = await instrument(page, 'E2E-M-INVALID');
  await denial(
    page,
    item.id,
    `${api}/public/metrology/borrow`,
    'POST',
    { instrumentId: item.id },
    403,
  );
  await denial(
    page,
    item.id,
    `${api}/public/metrology/borrow`,
    'POST',
    {
      token,
      instrumentId: item.id,
      borrowedAt: '2026-10-09',
      expectedReturnAt: '2026-10-08',
      borrowerName: 'E2E Reporter',
      borrowerDepartment: 'E2E Production',
    },
    400,
  );
});

test('metrology shared catalog reader and foreign department cannot perform privileged writes', async ({
  page,
}) => {
  await login(page);
  const item = await instrument(page, 'E2E-M-ACCESS');
  for (const suffix of ['_reader', '_foreign']) {
    const accessToken = await login(page, ledger, suffix);
    await expect(await row(page, item.instrumentCode)).toBeVisible();
    await expect(
      page.getByRole('button', { name: '新增', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('.vxe-table--fixed-right-wrapper').getByRole('button'),
    ).toHaveCount(0);
    await denial(
      page,
      item.id,
      `${api}/metrology/${item.id}`,
      'PUT',
      { instrumentCode: item.instrumentCode, instrumentName: 'Unauthorized' },
      403,
      accessToken,
    );
    await denial(
      page,
      item.id,
      `${api}/metrology/${item.id}`,
      'DELETE',
      undefined,
      403,
      accessToken,
    );
    await denial(
      page,
      item.id,
      `${api}/metrology/borrow`,
      'POST',
      { instrumentId: item.id },
      403,
      accessToken,
    );
    await page.goto(borrow);
    await expect(
      page.getByRole('button', { name: '手工借用', exact: true }),
    ).toHaveCount(0);
    await page.goto(plans);
    await expect(
      page.getByRole('button', { name: '新增', exact: true }),
    ).toHaveCount(0);
    await denial(
      page,
      item.id,
      `${api}/metrology/calibration-plan`,
      'POST',
      { instrumentId: item.id, planYear: 2026, planMonth: 12, planDay: 1 },
      403,
      accessToken,
    );
  }
});

test('metrology calibration UI plan completes by actual date and rejects invalid calendar and duplicate month', async ({
  page,
}) => {
  const accessToken = await login(page);
  const item = await instrument(page, 'E2E-M-PLAN');
  await page.goto(plans);
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const modal = page.locator('.ant-modal:visible');
  await field(page, modal, '量具名称').locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(`${item.instrumentName} / ${item.instrumentCode}`, {
      exact: true,
    })
    .click();
  const year = new Date().getFullYear();
  await field(page, modal, '计划年').locator('input').fill(String(year));
  const month = field(page, modal, '计划月').locator('.ant-select');
  await month.click();
  // Navigate the virtualized options through the select's keyboard interface.
  const monthInput = month.locator('input');
  await monthInput.press('Home');
  for (let index = 0; index < 11; index++) {
    await monthInput.press('ArrowDown');
  }
  await monthInput.press('Enter');
  await expect(month.locator('.ant-select-selection-item')).toHaveText('12');
  await field(page, modal, '计划日').locator('input').fill('20');
  const count = await db.metrology_calibration_plans.count();
  const result = await save(page, '/api/qms/metrology/calibration-plan');
  expect(await db.metrology_calibration_plans.count()).toBe(count + 1);
  const before = await state(item.id, 'planned');
  expect(before.plans[0].id).toBe(result.id);
  expect(before.plans[0].status).toBe('PLANNED');
  expect(before.plans[0].planMonth).toBe(12);
  await page.getByText('计划列表', { exact: true }).click();
  await action(page, item.instrumentCode, '编辑');
  const picker = field(
    page,
    page.locator('.ant-modal:visible'),
    '实际完成日期',
  ).locator('input');
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await picker.click();
  await picker.pressSequentially(today);
  await picker.press('Enter');
  await expect(picker).toHaveValue(today);
  await save(page, `/api/qms/metrology/calibration-plan/${result.id}`, 'PUT');
  const completed = await state(item.id, 'plan-completed');
  expect(completed.plans[0].status).toBe('COMPLETED');
  expect(completed.plans[0].actualDate.getDate()).toBe(
    Number(today.slice(8, 10)),
  );
  expect(completed.instrument).toEqual(before.instrument);
  await page.reload();
  await page.getByText('计划列表', { exact: true }).click();
  await expect(await row(page, item.instrumentCode)).toContainText('已完成');
  const payload = {
    instrumentId: item.id,
    planYear: year,
    planMonth: 12,
    planDay: 20,
  };
  await denial(
    page,
    item.id,
    `${api}/metrology/calibration-plan`,
    'POST',
    payload,
    409,
    accessToken,
  );
  await denial(
    page,
    item.id,
    `${api}/metrology/calibration-plan/${result.id}`,
    'PUT',
    { ...payload, planMonth: 2, planDay: 30 },
    400,
    accessToken,
  );
  expect(await db.metrology_calibration_plans.count()).toBe(count + 1);
});

test('metrology lost borrow response retries and concurrent claims never duplicate active records', async ({
  page,
}) => {
  const accessToken = await login(page);
  const item = await instrument(page, 'E2E-M-RETRY');
  await entry(page, item.instrumentCode);
  const form = page.locator('.ant-form:visible');
  await field(page, form, '借用部门').locator('input').fill('E2E Production');
  await field(page, form, '借用人').locator('input').fill('E2E Reporter');
  let requests = 0;
  await page.route('**/api/qms/public/metrology/borrow', async (route) => {
    const response = await route.fetch();
    requests++;
    if (requests === 1) {
      expect(response.status()).toBe(200);
      return route.abort('failed');
    }
    return route.fulfill({ response });
  });
  await page.getByRole('button', { name: '确认借用', exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  await expect(
    page.locator('.ant-message-notice, .ant-notification-notice').last(),
  ).toContainText('借用失败');
  const committed = await state(item.id, 'lost-response');
  expect(committed.borrows).toHaveLength(1);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/public/metrology/borrow') &&
      r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '确认借用', exact: true }).click();
  const received4 = await response;
  expect(received4.status()).toBe(409);
  expect(await state(item.id, 'retry')).toEqual(committed);
  await page.unroute('**/api/qms/public/metrology/borrow');
  const race = await instrument(page, 'E2E-M-RACE');
  const payload = {
    token,
    instrumentId: race.id,
    borrowedAt: '2026-10-09',
    borrowerName: 'E2E Reporter',
    borrowerDepartment: 'E2E Production',
  };
  const results = await Promise.all([
    page.request.post(`${api}/public/metrology/borrow`, { data: payload }),
    page.request.post(`${api}/public/metrology/borrow`, { data: payload }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const s = await state(race.id, 'concurrent');
  expect(s.instrument.borrowStatus).toBe('BORROWED');
  expect(s.borrows).toHaveLength(1);
  expect(s.borrows[0].instrumentId).toBe(race.id);
  const deletionRace = await instrument(page, 'E2E-M-DELETE-RACE');
  const competing = await Promise.all([
    page.request.post(`${api}/public/metrology/borrow`, {
      data: { ...payload, instrumentId: deletionRace.id },
    }),
    page.request.delete(`${api}/metrology/${deletionRace.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);
  const raced = await state(deletionRace.id, 'delete-versus-borrow');
  if (competing[0].status() === 200) {
    expect(competing[1].status()).toBe(409);
    expect(raced.instrument.isDeleted).toBe(false);
    expect(raced.instrument.borrowStatus).toBe('BORROWED');
    expect(raced.borrows).toHaveLength(1);
  } else {
    const rejected = await competing[0].json();
    // Deletion before the read is missing (400); after the read it loses CAS (409).
    if (competing[0].status() === 409) {
      expect(rejected.code).toBe(-1);
      expect(rejected.error.code).toBe('CONFLICT');
      expect(rejected.message).toBe('该量具当前不可借用或已被其他用户借出');
    } else {
      expect(competing[0].status()).toBe(400);
      expect(rejected.message).toBe('未找到对应量具');
    }
    expect(competing[1].status()).toBe(200);
    expect(raced.instrument.isDeleted).toBe(true);
    expect(raced.borrows).toHaveLength(0);
  }
});
