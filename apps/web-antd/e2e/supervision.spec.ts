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
const api = `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/supervision`;
const target = '/qms/supervision';

test.beforeAll(async () => {
  await assertOwnedTargets(process.env);
  expect(fixture.runId).toBe(process.env.QGS_E2E_RUN_ID);
  expect(fixture.supervisionBeforeUI).toEqual({
    projects: 0,
    reports: 0,
    issues: 0,
    planTasks: 0,
  });
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
    path: `${directory}/supervision-${info.status}-${info.testId}.png`,
    mask: [page.locator('input'), page.locator('textarea')],
  });
});

async function login(page: Page, suffix = '') {
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
  const resolved1 = await response;
  const body = await resolved1.json();
  expect(body.code).toBe(0);
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  await expect(
    page.getByRole('tab', { name: '监造项目', exact: true }),
  ).toBeVisible();
  return body.data.accessToken as string;
}
function drawer(page: Page) {
  return page.locator('.ant-drawer-content:visible').last();
}
function field(page: Page, box: Locator, label: string) {
  return box.locator('.ant-form-item').filter({
    has: page.locator('.ant-form-item-label').getByText(label, { exact: true }),
  });
}
async function select(page: Page, box: Locator, label: string, value: string) {
  const control = field(page, box, label).locator('.ant-select');
  await control.click();
  await page
    .locator('.ant-select-dropdown:visible')
    .locator('.ant-select-item-option-content')
    .getByText(value, { exact: true })
    .click();
}
async function submit(page: Page, name: string, url: string, method = 'POST') {
  const response = page.waitForResponse(
    (r) => r.url().includes(url) && r.request().method() === method,
  );
  await drawer(page)
    .getByRole('button', {
      name: new RegExp(`^${[...name].join(String.raw`\s*`)}$`),
    })
    .click();
  const res = await response;
  const body = await res.json();
  expect(res.status(), body.message).toBe(200);
  expect(body.code, body.message).toBe(0);
  await expect(drawer(page)).toHaveCount(0);
  return body.data;
}
async function row(page: Page, text: string) {
  const item = page
    .locator('.ant-tabs-tabpane-active tr.ant-table-row:visible')
    .filter({ hasText: text })
    .first();
  await expect(item).toBeVisible();
  return item;
}
async function tab(page: Page, name: string) {
  await page
    .getByRole('tab', {
      name: new RegExp(`^${[...name].join(String.raw`\s*`)}$`),
    })
    .click();
}
async function project(page: Page, name: string) {
  await tab(page, '监造项目');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const box = drawer(page);
  await field(page, box, '项目名称').locator('input').fill(name);
  await select(page, box, '供应商', 'E2E Supplier');
  const count = await db.supervision_projects.count();
  const result = await submit(page, '保存', '/supervision/projects');
  expect(await db.supervision_projects.count()).toBe(count + 1);
  const stored = await db.supervision_projects.findUniqueOrThrow({
    where: { id: result.id },
  });
  expect(stored).toMatchObject({
    projectName: name,
    supplierId: fixture.supplierId,
    supplierName: 'E2E Supplier',
    createdBy: fixture.userId,
    isDeleted: false,
    status: 'PLANNED',
  });
  return stored;
}
async function state(id: string, label: string) {
  const value = await db.supervision_projects.findUniqueOrThrow({
    where: { id },
    include: {
      planTasks: true,
      dailyReports: { include: { taskUpdates: true } },
      issues: { include: { actions: true } },
    },
  });
  // JSON serialization normalizes Prisma Date and Decimal values for disk evidence.
  const serialized = JSON.stringify(value);
  const normalized = JSON.parse(serialized);
  for (const item of normalized.planTasks) {
    item.completedQuantity = Number(item.completedQuantity);
    item.plannedQuantity = Number(item.plannedQuantity);
  }
  for (const report of normalized.dailyReports) {
    for (const item of report.taskUpdates) {
      item.completedQuantity = Number(item.completedQuantity);
      item.plannedQuantity = Number(item.plannedQuantity);
    }
  }
  writeFileSync(
    `${directory}/supervision-${label}-${id}.json`,
    JSON.stringify(normalized, null, 2),
  );
  return normalized;
}
async function denial(
  page: Page,
  id: string,
  url: string,
  method: string,
  data: unknown,
  status: number,
  token: string,
) {
  const before = await state(id, `denial-${status}-before`);
  const response = await page.request.fetch(url, {
    method,
    data,
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  writeFileSync(
    `${directory}/supervision-denial-${status}.json`,
    JSON.stringify({ status: response.status(), body }, null, 2),
  );
  expect(response.status(), body.message).toBe(status);
  expect(await state(id, `denial-${status}-after`)).toEqual(before);
}
async function task(page: Page, p: { id: string; projectName: string }) {
  await tab(page, '监造项目');
  const resolved2 = await row(page, p.projectName);
  await resolved2.getByRole('button', { name: /甘\s*特/ }).click();
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  const box = drawer(page);
  await field(page, box, '标识号').locator('input').fill('1');
  await field(page, box, '任务名称')
    .locator('input')
    .fill(`Task ${p.projectName}`);
  await field(page, box, '计划数量').locator('input').fill('10');
  const count = await db.supervision_plan_tasks.count();
  await submit(page, '创建', `/projects/${p.id}/plan-tasks`);
  expect(await db.supervision_plan_tasks.count()).toBe(count + 1);
  const stored = await db.supervision_plan_tasks.findFirstOrThrow({
    where: { projectId: p.id, isDeleted: false },
  });
  expect(Number(stored.plannedQuantity)).toBe(10);
  return stored;
}
async function reportForm(page: Page, p: { projectName: string }) {
  await tab(page, '现场日报');
  await page.getByRole('button', { name: '新建日报', exact: true }).click();
  const box = drawer(page);
  await select(page, box, '监造项目', `${p.projectName} / E2E Supplier`);
  await field(page, box, '监造人员').locator('input').fill('E2E Reporter');
  const toggle = box.getByRole('switch').first();
  if ((await toggle.getAttribute('aria-checked')) === 'false')
    await toggle.click();
  await field(page, box, '累计完成').locator('input').fill('10');
  await field(page, box, '今日完成内容')
    .locator('textarea')
    .fill('E2E inspected ten units');
  await field(page, box, '工作内容')
    .locator('textarea')
    .fill(`Report ${p.projectName}`);
}
async function issue(page: Page, p: { id: string; projectName: string }) {
  await tab(page, '问题闭环');
  await page.getByRole('button', { name: '新建问题', exact: true }).click();
  const box = drawer(page);
  await select(page, box, '监造项目', `${p.projectName} / E2E Supplier`);
  await field(page, box, '问题描述')
    .locator('textarea')
    .fill(`Issue ${p.projectName}`);
  await field(page, box, '整改要求')
    .locator('textarea')
    .fill('Repair and inspect');
  const count = await db.supervision_issues.count();
  const created = await submit(page, '保存', '/supervision/issues');
  expect(await db.supervision_issues.count()).toBe(count + 1);
  const stored = await db.supervision_issues.findUniqueOrThrow({
    where: { id: created.id },
  });
  expect(stored).toMatchObject({
    projectId: p.id,
    createdBy: fixture.userId,
    status: 'OPEN',
  });
  return stored;
}
async function action(
  page: Page,
  item: { id: string; issueNo: string },
  status: string,
) {
  await tab(page, '问题闭环');
  const resolved3 = await row(page, item.issueNo);
  await resolved3.getByRole('button', { name: /处\s*理/ }).click();
  const box = drawer(page);
  await select(page, box, '更新状态', status);
  await field(page, box, '处理说明').locator('textarea').fill(`E2E ${status}`);
  await field(page, box, '验证结果').locator('textarea').fill('E2E verified');
  await submit(page, '保存', `/issues/${item.id}/actions`);
  const resolved4 = await db.supervision_issues.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect(resolved4.status).toBe(status);
}

test('supervision project UI registration edits reopens and soft deletes canonical ownership', async ({
  page,
}) => {
  await login(page);
  const p = await project(page, 'E2E-S-PROJECT');
  const resolved5 = await row(page, p.projectName);
  await resolved5.getByRole('button', { name: /编\s*辑/ }).click();
  await field(page, drawer(page), '项目名称')
    .locator('input')
    .fill('E2E-S-PROJECT-EDIT');
  await submit(page, '保存', `/projects/${p.id}`, 'PUT');
  await page.reload();
  const resolved6 = await row(page, 'E2E-S-PROJECT-EDIT');
  await resolved6.locator('td').first().click();
  await expect(drawer(page)).toContainText('E2E-S-PROJECT-EDIT');
  await drawer(page)
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  const resolved7 = await row(page, 'E2E-S-PROJECT-EDIT');
  await resolved7.getByRole('button', { name: /删\s*除/ }).click();
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'DELETE' &&
      r.url().includes('/supervision/projects'),
  );
  await page
    .locator('.ant-modal-confirm:visible')
    .getByRole('button', { name: /确\s*定/ })
    .click();
  const resolved8 = await response;
  expect(resolved8.status()).toBe(200);
  const resolved9 = await state(p.id, 'deleted');
  expect(resolved9.isDeleted).toBe(true);
});
test('supervision UI task and daily report complete project with persisted quantities and identities', async ({
  page,
}) => {
  await login(page);
  const p = await project(page, 'E2E-S-REPORT');
  const t = await task(page, p);
  await reportForm(page, p);
  const count = await db.supervision_daily_reports.count();
  await submit(page, '提交', '/supervision/reports');
  expect(await db.supervision_daily_reports.count()).toBe(count + 1);
  const s = await state(p.id, 'completed');
  expect(s.status).toBe('COMPLETED');
  expect(s.progressPercent).toBe(100);
  expect(s.planTasks[0]).toMatchObject({
    id: t.id,
    completedQuantity: 10,
    progressPercent: 100,
    status: 'DONE',
  });
  expect(s.dailyReports).toHaveLength(1);
  expect(s.dailyReports[0]).toMatchObject({
    createdBy: fixture.userId,
    reporter: 'E2E Reporter',
  });
  expect(s.dailyReports[0].taskUpdates[0]).toMatchObject({
    taskId: t.id,
    projectId: p.id,
    completedQuantity: 10,
    progressPercent: 100,
  });
  await page.reload();
  await tab(page, '监造项目');
  await expect(await row(page, p.projectName)).toContainText('COMPLETED');
});
test('supervision UI rectification follow up verification and close preserve action history', async ({
  page,
}) => {
  await login(page);
  const p = await project(page, 'E2E-S-ISSUE');
  const item = await issue(page, p);
  await action(page, item, 'IN_PROGRESS');
  await action(page, item, 'VERIFYING');
  await action(page, item, 'CLOSED');
  const s = await state(p.id, 'issue-closed');
  expect(s.issues[0].actions).toHaveLength(3);
  expect(s.issues[0]).toMatchObject({
    status: 'CLOSED',
    verifyResult: 'E2E verified',
    correctiveAction: 'Repair and inspect',
  });
  expect(s.issues[0].closedAt).not.toBeNull();
  await page.reload();
  await tab(page, '问题闭环');
  await expect(await row(page, item.issueNo)).toContainText('CLOSED');
});
test('supervision creator scope and read only role reject writes without inventing departmental read isolation', async ({
  page,
}) => {
  await login(page);
  const p = await project(page, 'E2E-S-ACCESS');
  const t = await task(page, p);
  const item = await issue(page, p);
  for (const [suffix, status] of [
    ['_foreign', 404],
    ['_reader', 403],
  ] as const) {
    const token = await login(page, suffix);
    await expect(await row(page, p.projectName)).toBeVisible();
    const original = await state(p.id, `ui-denial-${status}-before`);
    const resolved10 = await row(page, p.projectName);
    await resolved10.getByRole('button', { name: /编\s*辑/ }).click();
    await field(page, drawer(page), '项目名称')
      .locator('input')
      .fill('Forbidden UI change');
    const rejected = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' && r.url().includes(`/projects/${p.id}`),
    );
    await drawer(page)
      .getByRole('button', { name: /保\s*存/ })
      .click();
    const resolved11 = await rejected;
    expect(resolved11.status()).toBe(status);
    await expect(drawer(page)).toBeVisible();
    expect(await state(p.id, `ui-denial-${status}-after`)).toEqual(original);
    await drawer(page)
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await denial(
      page,
      p.id,
      `${api}/projects/${p.id}`,
      'PUT',
      { projectName: 'Unauthorized' },
      status,
      token,
    );
    await denial(
      page,
      p.id,
      `${api}/projects/${p.id}?id=${p.id}`,
      'DELETE',
      undefined,
      status,
      token,
    );
    await denial(
      page,
      p.id,
      `${api}/projects/${p.id}/plan-tasks/${t.id}`,
      'PUT',
      { taskName: 'Unauthorized' },
      status,
      token,
    );
    await denial(
      page,
      p.id,
      `${api}/issues/${item.id}`,
      'PUT',
      { status: 'CLOSED' },
      status,
      token,
    );
    await denial(
      page,
      p.id,
      `${api}/reports`,
      'POST',
      { projectId: p.id, taskUpdates: [] },
      status,
      token,
    );
  }
});
test('supervision terminal states reject illegal changes and completed task deletion without data loss', async ({
  page,
}) => {
  const token = await login(page);
  const p = await project(page, 'E2E-S-STATE');
  const t = await task(page, p);
  const item = await issue(page, p);
  await action(page, item, 'CLOSED');
  await denial(
    page,
    p.id,
    `${api}/issues/${item.id}`,
    'PUT',
    { status: 'IN_PROGRESS' },
    409,
    token,
  );
  await denial(
    page,
    p.id,
    `${api}/issues/${item.id}/actions`,
    'POST',
    { status: 'VERIFYING', description: 'Illegal jump' },
    409,
    token,
  );
  await reportForm(page, p);
  await submit(page, '提交', '/supervision/reports');
  await denial(
    page,
    p.id,
    `${api}/projects/${p.id}`,
    'PUT',
    { status: 'PAUSED' },
    409,
    token,
  );
  await denial(
    page,
    p.id,
    `${api}/projects/${p.id}/plan-tasks/${t.id}`,
    'DELETE',
    undefined,
    409,
    token,
  );
});
test('supervision committed response loss retry and concurrent state claims preserve one business write', async ({
  page,
}) => {
  const token = await login(page);
  const p = await project(page, 'E2E-S-RETRY');
  const item = await issue(page, p);
  const resolved12 = await row(page, item.issueNo);
  await resolved12.getByRole('button', { name: /处\s*理/ }).click();
  const box = drawer(page);
  await select(page, box, '更新状态', 'CLOSED');
  await field(page, box, '处理说明').locator('textarea').fill('E2E retry');
  let committed = false;
  const keys: string[] = [];
  let submitted: Record<string, unknown> = {};
  await page.route(`**/issues/${item.id}/actions`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    submitted = route.request().postDataJSON();
    const response = await route.fetch();
    if (!committed) {
      expect(response.status()).toBe(200);
      committed = true;
      return route.abort('failed');
    }
    return route.fulfill({ response });
  });
  await box.getByRole('button', { name: /保\s*存/ }).click();
  await expect.poll(() => committed).toBe(true);
  const before = await state(p.id, 'lost-response');
  expect(before.issues[0].actions).toHaveLength(1);
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes(`/issues/${item.id}/actions`),
  );
  await box.getByRole('button', { name: /保\s*存/ }).click();
  const resolved13 = await response;
  expect(resolved13.status()).toBe(409);
  expect(await state(p.id, 'retry')).toEqual(before);
  // A delayed retry must remain safe after the global dedupe window expires.
  await waitOutDedupeWindow(page);
  const delayed = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes(`/issues/${item.id}/actions`),
  );
  await box.getByRole('button', { name: /保\s*存/ }).click();
  const delayedResponse = await delayed;
  const afterDelayed = await state(p.id, 'delayed-retry');
  expect(afterDelayed.issues[0].actions).toHaveLength(1);
  expect(delayedResponse.status()).toBe(200);
  const resolved14 = await delayedResponse.json();
  expect(resolved14.data.id).toBe(before.issues[0].actions[0].id);
  expect(keys).toHaveLength(3);
  expect(Boolean(keys[0])).toBe(true);
  expect(new Set(keys).size).toBe(1);
  expect(afterDelayed).toEqual(before);
  await page.unroute(`**/issues/${item.id}/actions`);
  const conflict = await page.request.post(`${api}/issues/${item.id}/actions`, {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': keys[0] },
    data: { ...submitted, description: 'Changed payload with same key' },
  });
  const conflictBody = await conflict.json();
  expect(conflict.status()).toBe(409);
  expect(conflictBody.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  expect(await state(p.id, 'key-conflict')).toEqual(before);
  const results = await Promise.all([
    page.request.put(`${api}/issues/${item.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'IN_PROGRESS' },
    }),
    page.request.put(`${api}/issues/${item.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'VERIFYING' },
    }),
  ]);
  expect(results.map((r) => r.status())).toEqual([409, 409]);
  expect(await state(p.id, 'concurrent-denials')).toEqual(before);
  await waitOutDedupeWindow(page);
  const resolved15 = await row(page, item.issueNo);
  await resolved15.getByRole('button', { name: /处\s*理/ }).click();
  await field(page, drawer(page), '处理说明')
    .locator('textarea')
    .fill('E2E retry');
  const next = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes(`/issues/${item.id}/actions`),
  );
  await drawer(page)
    .getByRole('button', { name: /保\s*存/ })
    .click();
  const nextResponse = await next;
  expect(nextResponse.status()).toBe(200);
  expect(nextResponse.request().headers()['idempotency-key']).not.toBe(keys[0]);
  expect(nextResponse.request().postDataJSON()).toEqual(submitted);
  await expect(drawer(page)).toHaveCount(0);
  const followed = await state(p.id, 'legitimate-new-followup');
  expect(followed.issues[0].actions).toHaveLength(2);
  expect(
    new Set(followed.issues[0].actions.map((a: { id: string }) => a.id)).size,
  ).toBe(2);
  const raced = await issue(page, p);
  const resolved16 = await row(page, raced.issueNo);
  await resolved16.getByRole('button', { name: /处\s*理/ }).click();
  await select(page, drawer(page), '更新状态', 'CLOSED');
  await field(page, drawer(page), '处理说明')
    .locator('textarea')
    .fill('E2E concurrent claim');
  let claims: { id: string; status: number }[] = [];
  // Both sends originate from the submitted UI request. Distinct query strings
  // bypass only the global short dedupe, exercising the real DB unique claim.
  await page.route(`**/issues/${raced.id}/actions`, async (route) => {
    const responses = await Promise.all(
      [1, 2].map((send) =>
        route.fetch({ url: `${route.request().url()}?e2eSend=${send}` }),
      ),
    );
    claims = await Promise.all(
      responses.map(async (r) => {
        const body = await r.json();
        return { status: r.status(), id: body.data?.id };
      }),
    );
    await route.fulfill({ response: responses[0] });
  });
  await drawer(page)
    .getByRole('button', { name: /保\s*存/ })
    .click();
  await expect(drawer(page)).toHaveCount(0);
  expect(claims.map((c) => c.status)).toEqual([200, 200]);
  expect(claims[0].id).toBeTruthy();
  expect(claims[1].id).toBe(claims[0].id);
  const final = await state(p.id, 'concurrent-claim');
  const stored = final.issues.find((i: { id: string }) => i.id === raced.id);
  expect(stored.status).toBe('CLOSED');
  expect(stored.actions).toHaveLength(1);
  expect(stored.actions[0].id).toBe(claims[0].id);
  await page.unroute(`**/issues/${raced.id}/actions`);
});
