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
const lastLoginAt = new Map<string, number>();
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.beforeAll(async () => {
  await assertOwnedTargets(process.env);
  db = new PrismaClient();
});
test.afterAll(async () => {
  await db?.$disconnect();
});
test.beforeEach(async ({ page }, info) => {
  await expect(page).toHaveURL('about:blank');
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
    path: `${directory}/${info.status}-${info.testId}.png`,
    mask: [page.locator('input')],
  });
});

/** Every identity authenticates through the real UI; only test storage is cleared. */
async function login(page: Page, suffix = '') {
  // Re-authentication is a prerequisite, not a test of the dedupe window.
  const remaining = remainingDedupeWait(lastLoginAt.get(suffix));
  if (remaining > 0) await page.waitForTimeout(remaining);
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/auth/login?redirect=/qms/inspection/requests');
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
  lastLoginAt.set(suffix, Date.now());
  const result = await loginRes.json();
  expect(result.code, result.message).toBe(0);
  expect(result.data.username).toBe(`${process.env.QGS_E2E_USERNAME}${suffix}`);
  await expect(page).toHaveURL(/\/qms\/inspection\/requests$/);
  await expect(
    page.getByRole('heading', { name: '报检任务', exact: true }),
  ).toBeVisible();
  return result.data.accessToken as string;
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
    // Work order options render as "<workOrderNumber> - <projectName>"
    // when the order carries a project, so match the canonical number.
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
  const uploaded = await res.json();
  expect(uploaded.code).toBe(0);
  await expect(
    page
      .locator('.ant-upload-list-item-done:visible')
      .filter({ has: page.getByText(name, { exact: true }) })
      .first(),
  ).toBeVisible();
  return uploaded.data.url as string;
}

/** The shared Vben form labels wrap controls rather than naming Ant inputs. */
function issueField(scope: Locator, label: string) {
  return scope.locator('label').filter({ hasText: label }).locator('..');
}

async function fillRequest(
  page: Page,
  marker: string,
  incoming = false,
  options: {
    freeMaterial?: string;
    outsourcing?: boolean;
    secondWorkOrder?: boolean;
    workOrder?: string;
  } = {},
) {
  await page.goto(
    `/qms/inspection/requests/${incoming ? 'incoming-entry' : 'entry'}`,
  );
  const form = page
    .locator('.inspection-request-entry-page')
    .or(page.locator('main'));
  // Entry is a single form; exact labels avoid the hidden entry modal.
  const formCount = await form.count();
  const scope = formCount > 0 ? form.first() : page.locator('body');
  await choose(page, scope, '工单号', options.workOrder || 'E2E-WO-001');
  if (options.secondWorkOrder) {
    await page.keyboard.press('Escape');
    await choose(page, scope, '工单号', 'E2E-WO-002');
  }
  if (incoming) {
    await page.keyboard.press('Escape');
    await choose(page, scope, '进货类型', 'E2E Fabrication');
    const partItem = scope.locator('.ant-form-item').filter({
      has: page
        .locator('.ant-form-item-label')
        .getByText('物料名称', { exact: true }),
    });
    if (options.freeMaterial) {
      await partItem.locator('input').fill(options.freeMaterial);
    } else {
      await partItem.locator('.ant-select').click();
      await page
        .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
        .getByText('BOM · E2E Canonical Part', { exact: true })
        .click();
    }
    if (options.outsourcing) {
      await choose(page, scope, '责任归属类型', '外协单位');
      await choose(page, scope, '外协单位', 'E2E Outsourcing');
    } else {
      await choose(page, scope, '责任归属类型', '供应商');
      await choose(page, scope, '供应商', 'E2E Supplier');
    }
  } else {
    await choose(page, scope, '工序', 'E2E Fabrication');
    await choose(page, scope, '一级部件名称', 'E2E Canonical Part');
    await page.getByPlaceholder('请输入组件名称').fill(marker);
    await choose(page, scope, '责任部门', 'E2E Production');
  }
  if (!incoming && options.outsourcing) {
    await choose(page, scope, '责任归属类型', '外协单位');
    await choose(page, scope, '外协单位', 'E2E Outsourcing');
  }
  await page.getByRole('spinbutton').fill('3');
  await page.getByPlaceholder('请输入报检人').fill('E2E Reporter');
  await page.getByPlaceholder('请输入补充说明').fill(marker);
  await upload(
    page,
    page.locator('input[type=file]').last(),
    `${marker}-self.png`,
  );
}

async function create(page: Page, marker: string, incoming = false) {
  await login(page);
  await fillRequest(page, marker, incoming);
  const response = page.waitForResponse(
    (r) => r.url().includes('/requests/v2') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交报检', exact: true }).click();
  const createRes = await response;
  const result = await createRes.json();
  expect(result.code).toBe(0);
  expect(result.data.partId).toBe(fixture.partId);
  expect(result.data.processId).toBe(fixture.processId);
  return result.data;
}

async function dispatch(
  page: Page,
  request: { id: string; requestNo: string },
) {
  await page.goto('/qms/inspection/requests');
  const row = page.locator('tbody tr').filter({ hasText: request.requestNo });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: '派单', exact: true }).click();
  const modal = page.locator('.ant-modal:visible');
  await choose(page, modal, '检验员', 'E2E QC');
  await modal.locator('textarea').fill('E2E UI dispatch');
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/${request.id}/dispatch`),
  );
  await modal.getByRole('button', { name: '确定派单' }).click();
  const dispatchRes = await response;
  const result = await dispatchRes.json();
  expect(result.code).toBe(0);
  await expect(modal).toBeHidden();
  const state = await snapshot(request.id, 'dispatched');
  expect(state.request.status).toBe('DISPATCHED');
  expect(state.request.inspectorId).toBe(fixture.qcId);
  expect(state.task.status).toBe('DISPATCHED');
  expect(state.task.assigneeId).toBe(fixture.qcId);
}

async function openClose(
  page: Page,
  request: { id: string; requestNo: string },
) {
  await page.goto('/qms/inspection/requests');
  const row = page.locator('tbody tr').filter({ hasText: request.requestNo });
  await expect(row).toHaveCount(1);
  const button = row
    .getByRole('button', { exact: true, name: '完成' })
    .or(row.getByRole('button', { exact: true, name: '完成检验' }));
  await button.click();
  const modal = page.locator('.ant-modal:visible');
  await expect(modal).toContainText('检验结果');
  return modal;
}

/** Only reads business tables; all tested writes happen in the browser UI. */
async function snapshot(id: string, stage: string) {
  const request = await db.qms_inspection_requests.findUniqueOrThrow({
    where: { id },
  });
  const task = request.dispatchTaskId
    ? await db.qms_task_dispatches.findUniqueOrThrow({
        where: { id: request.dispatchTaskId },
      })
    : null;
  const inspection = request.inspectionId
    ? await db.inspections.findUniqueOrThrow({
        where: { id: request.inspectionId },
      })
    : null;
  const issue = request.linkedIssueId
    ? await db.quality_records.findUniqueOrThrow({
        where: { id: request.linkedIssueId },
      })
    : null;
  const links = await db.qms_inspection_request_inspections.findMany({
    where: { requestId: id },
  });
  const state = { request, task, inspection, issue, links };
  writeFileSync(
    `${directory}/state-${stage}-${id}.json`,
    JSON.stringify(state, null, 2),
  );
  return state;
}

async function closePass(
  page: Page,
  request: { id: string; requestNo: string },
  lostResponse = false,
) {
  const modal = await openClose(page, request);
  await upload(
    page,
    modal.locator('input[type=file]'),
    'e2e-inspection-record.png',
  );
  await modal.locator('textarea').fill('E2E verified and accepted');
  const url = `**/requests/${request.id}/close`;
  if (lostResponse) {
    await page.route(
      url,
      async (route) => {
        const committed = await route.fetch();
        expect(committed.ok()).toBeTruthy();
        await route.abort('failed');
      },
      { times: 1 },
    );
    const failed = page.waitForEvent('requestfailed', {
      predicate: (r) => r.url().endsWith(`/${request.id}/close`),
    });
    await modal.getByRole('button', { name: /确\s*定/ }).click();
    await failed;
    await expect(modal.getByRole('button', { name: /确\s*定/ })).toBeEnabled();
    const committed = await snapshot(request.id, 'close-response-lost');
    expect(committed.request.status).toBe('CLOSED');
    // Let transport dedupe expire so this checks the business state guard.
    await waitOutDedupeWindow(page);
    const retry = page.waitForResponse((r) =>
      r.url().endsWith(`/${request.id}/close`),
    );
    await modal.getByRole('button', { name: /确\s*定/ }).click();
    const retried = await retry;
    expect(retried.status()).toBe(400);
    await expect(
      page.getByText('报检任务已检验完成', { exact: true }).first(),
    ).toBeVisible();
    expect(await snapshot(request.id, 'close-retry')).toEqual(committed);
    return committed;
  }
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/${request.id}/close`),
  );
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  const closeRes = await response;
  const result = await closeRes.json();
  expect(result.code).toBe(0);
  await expect(modal).toBeHidden();
  return snapshot(request.id, 'passed');
}

function assertPassed(state: Awaited<ReturnType<typeof snapshot>>) {
  expect(state.request.status).toBe('CLOSED');
  expect(state.request.inspectionResult).toBe('PASS');
  expect(state.request.qualifiedQuantity).toBe(3);
  expect(state.request.unqualifiedQuantity).toBe(0);
  expect(state.task.status).toBe('COMPLETED');
  expect(state.inspection.result).toBe('PASS');
  expect(state.inspection.quantity).toBe(3);
  expect(state.inspection.partId).toBe(fixture.partId);
  expect(state.request.processId).toBe(fixture.processId);
  if (state.request.category === 'INCOMING') {
    // Incoming records use incomingType, not the PROCESS-only process fields.
    expect(state.inspection.processId).toBeNull();
    expect(state.inspection.incomingType).toBe('E2E Fabrication');
  } else {
    expect(state.inspection.processId).toBe(fixture.processId);
  }
  expect(state.links).toHaveLength(1);
  expect(state.links[0].inspectionId).toBe(state.inspection.id);
  expect(state.inspection.selfCheckDocuments).toContain('-self.png');
  expect(state.inspection.selfCheckDocuments).not.toContain(
    'e2e-inspection-record.png',
  );
  expect(state.inspection.documents).toContain('e2e-inspection-record.png');
  expect(state.inspection.documents).not.toContain('-self.png');
}

test('process request dispatches to QC and closes with real inspection records despite a lost response', async ({
  page,
}) => {
  const request = await create(page, 'E2E-PASS');
  await dispatch(page, request);
  await login(page, '_qc');
  const state = await closePass(page, request, true);
  assertPassed(state);
  expect(state.issue).toBeNull();
});

test('failed inspection links an issue, saves disposition and closes after QC reinspection', async ({
  page,
}) => {
  const request = await create(page, 'E2E-FAIL');
  await dispatch(page, request);
  await login(page, '_qc');
  const modal = await openClose(page, request);
  await choose(page, modal, '检验结果', '不合格');
  const fields = modal.locator('.issue-form-fields');
  await issueField(fields, '缺陷分类').locator('.ant-select').click();
  await page
    .getByText('E2E Dimensional Defect', { exact: true })
    .last()
    .click();
  await issueField(fields, '二级分类').locator('.ant-select').click();
  await page
    .getByText('E2E Dimension Mismatch', { exact: true })
    .last()
    .click();
  await issueField(fields, '问题描述')
    .locator('textarea')
    .fill('E2E dimension is out of tolerance');
  await issueField(fields, '原因分析')
    .locator('textarea')
    .fill('E2E fixture setup mismatch');
  await issueField(fields, '解决方案')
    .locator('textarea')
    .fill('E2E rework and reinspect');
  const defectUrl = await upload(
    page,
    fields.locator('input[type=file]').last(),
    'e2e-defect.png',
  );
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/${request.id}/close`),
  );
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  const closeRes = await response;
  const closeBody = await closeRes.json();
  expect(closeBody.code).toBe(0);
  await expect(modal).toBeHidden();
  const failed = await snapshot(request.id, 'failed-inspection');
  expect(failed.request.status).toBe('INSPECTING');
  expect(failed.task.status).toBe('PROCESSING');
  expect(failed.inspection.result).toBe('FAIL');
  expect(failed.request.unqualifiedQuantity).toBe(3);
  expect(failed.issue.status).toBe('OPEN');
  expect(failed.issue.inspectionId).toBe(failed.inspection.id);
  expect(failed.issue.partName).toBe('E2E-FAIL');
  expect(failed.issue.defectCategoryId).toBe(fixture.defectCategoryId);
  expect(failed.issue.defectSubcategoryId).toBe(fixture.defectSubcategoryId);
  expect(failed.issue.responsibleDepartmentId).toBe(fixture.departmentId);
  expect(JSON.parse(failed.issue.issuePhoto)).toEqual([defectUrl]);
  expect(failed.inspection.partId).toBe(fixture.partId);
  expect(failed.issue.rootCause).toBe('E2E fixture setup mismatch');
  await page.goto('/qms/inspection/issues');
  const row = page
    .locator('.vxe-body--row')
    .filter({ hasText: 'E2E dimension is out of tolerance' });
  await expect(row).toBeVisible();
  const rowId = await row.getAttribute('rowid');
  expect(rowId).toBeTruthy();
  // VXE renders fixed columns in a second table with the same row identity.
  const editButton = page
    .locator('.vxe-table--fixed-right-wrapper')
    .locator(`tr[rowid="${rowId}"]`)
    .locator('[data-action="edit"]');
  await expect(editButton).toHaveCount(1);
  await editButton.hover();
  await expect(
    page.getByRole('tooltip').getByText('编辑', { exact: true }),
  ).toBeVisible();
  await editButton.click();
  const edit = page.locator('.ant-modal:visible');
  await issueField(edit, '状态').locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('进行中', { exact: true })
    .click();
  await issueField(edit, '解决方案')
    .locator('textarea')
    .fill('E2E rework completed; QC reinspection required');
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/issues/${failed.issue.id}`) &&
      r.request().method() === 'PUT',
  );
  await edit.getByRole('button', { name: /确\s*定/ }).click();
  const saveRes = await saved;
  const saveBody = await saveRes.json();
  expect(saveBody.code).toBe(0);
  await expect(edit).toBeHidden();
  const disposition = await snapshot(request.id, 'disposition');
  expect(disposition.issue.status).toBe('IN_PROGRESS');
  expect(disposition.issue.solution).toBe(
    'E2E rework completed; QC reinspection required',
  );
  const accepted = await closePass(page, request);
  assertPassed(accepted);
  expect(accepted.request.linkedIssueId).toBe(failed.issue.id);
  expect(accepted.inspection.id).toBe(failed.inspection.id);
  expect(accepted.issue.status).toBe('CLOSED');
  expect(accepted.request.linkedIssueStatus).toBe('CLOSED');
});

test('incoming request preserves supplier identity through UI dispatch and acceptance', async ({
  page,
}) => {
  const request = await create(page, 'E2E-INCOMING', true);
  expect(request.category).toBe('INCOMING');
  expect(request.supplierId).toBe(fixture.supplierId);
  await dispatch(page, request);
  await login(page, '_qc');
  const accepted = await closePass(page, request);
  assertPassed(accepted);
  expect(accepted.inspection.category).toBe('INCOMING');
  expect(accepted.inspection.supplierId).toBe(fixture.supplierId);
  expect(accepted.inspection.teamId).toBeNull();
});

test('department and role boundaries reject foreign reads and writes without changing persisted data', async ({
  page,
}) => {
  const request = await create(page, 'E2E-ACCESS');
  await dispatch(page, request);
  const before = await snapshot(request.id, 'before-denials');
  for (const suffix of ['_foreign', '_reader', '_otherqc']) {
    const token = await login(page, suffix);
    await expect(
      page.locator('tbody tr').filter({ hasText: request.requestNo }),
    ).toHaveCount(0);
    if (suffix === '_foreign') {
      const detail = page.waitForResponse((r) =>
        r.url().endsWith(`/requests/${request.id}`),
      );
      await page.goto(
        `/qms/inspection/requests?dispatchRequestId=${request.id}`,
      );
      const deniedDetail = await detail;
      const detailBody = await deniedDetail.json();
      writeFileSync(
        `${directory}/foreign-detail.json`,
        JSON.stringify(
          {
            status: deniedDetail.status(),
            body: detailBody,
          },
          null,
          2,
        ),
      );
      expect(deniedDetail.status()).toBe(404);
      expect(detailBody.code).toBe(-1);
      await expect(
        page.getByText('任务不存在或已被删除', { exact: true }).first(),
      ).toBeVisible();
      await expect(page.locator('.ant-drawer-content:visible')).toHaveCount(0);
      await expect(
        page.locator('tbody tr').filter({ hasText: request.requestNo }),
      ).toHaveCount(0);
    }
    // Adversarial forged HTTP attempts complement the UI denial. These must fail,
    // never prepare or replace a successful business mutation.
    const operation = suffix === '_otherqc' ? 'close' : 'dispatch';
    const response = await page.request.post(
      `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/inspection/requests/${request.id}/${operation}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data:
          operation === 'dispatch'
            ? { inspectorId: fixture.otherQcId, priority: 3 }
            : {
                inspector: 'E2E Other QC',
                result: 'PASS',
                quantity: 3,
                attachments: [
                  { name: 'denied.png', url: '/uploads/denied.png' },
                ],
              },
      },
    );
    const rejection = await response.json();
    writeFileSync(
      `${directory}/denial-${suffix}.json`,
      JSON.stringify({ status: response.status(), body: rejection }, null, 2),
    );
    expect(await snapshot(request.id, `denied-${suffix}`)).toEqual(before);
    expect(rejection.code).toBe(-1);
    expect([403, 404]).toContain(response.status());
  }
});

test('double submission and retry after a committed response loss create only one request', async ({
  page,
}) => {
  await login(page);
  await fillRequest(page, 'E2E-RETRY');
  const before = await db.qms_inspection_requests.count();
  const keys: string[] = [];
  let committedId = '';
  await page.route('**/public/inspection/requests/v2', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) {
      const real = await route.fetch();
      const body = await real.json();
      expect(body.code).toBe(0);
      committedId = body.data.id;
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  const button = page.getByRole('button', { name: '提交报检', exact: true });
  const failed = page.waitForEvent('requestfailed', {
    predicate: (r) => r.url().includes('/requests/v2'),
  });
  await button.click();
  await failed;
  await expect(button).toBeEnabled();
  expect(await db.qms_inspection_requests.count()).toBe(before + 1);
  // Inside the dedupe window the server protects writes with 409 duplicate request.
  const dedupeResponse = page.waitForResponse((r) =>
    r.url().includes('/requests/v2'),
  );
  await button.click();
  const dedupeRes = await dedupeResponse;
  const dedupeBody = await dedupeRes.json();
  expect(dedupeBody.message).toContain('请求重复');
  expect(await db.qms_inspection_requests.count()).toBe(before + 1);
  // After the dedupe window, the business idempotency engine safely replays the created record.
  await waitOutDedupeWindow(page);
  const response = page.waitForResponse((r) =>
    r.url().includes('/requests/v2'),
  );
  await button.click();
  const retryRes = await response;
  const retried = await retryRes.json();
  writeFileSync(
    `${directory}/retry-outcome.json`,
    JSON.stringify(
      {
        code: retried.code,
        error: retried.error,
        message: retried.message,
        keysMatch: keys.length === 3 && keys.every((key) => key === keys[0]),
      },
      null,
      2,
    ),
  );
  expect(
    retried.code,
    JSON.stringify({ error: retried.error, message: retried.message }),
  ).toBe(0);
  expect(retried.data.id).toBe(committedId);
  expect(keys).toHaveLength(3);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).toBe(keys[0]);
  expect(await db.qms_inspection_requests.count()).toBe(before + 1);
  const retrySnapshot = await snapshot(committedId, 'create-retry');
  expect(retrySnapshot.request.status).toBe('SUBMITTED');
});

async function submitBranch(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes('/requests/v2') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交报检', exact: true }).click();
  const res = await response;
  const body = await res.json();
  writeFileSync(
    `${directory}/branch-create-${body.data?.id || 'rejected'}.json`,
    JSON.stringify({ status: res.status(), body }, null, 2),
  );
  expect(body.code, body.message).toBe(0);
  return {
    request: body.data,
    payload: res.request().postDataJSON(),
    headers: res.request().headers(),
  };
}

async function recordDenial(
  page: Page,
  path: string,
  token: string,
  data: object,
  stage: string,
) {
  const response = await page.request.post(
    `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': `e2e-${stage}`,
      },
      data,
    },
  );
  const body = await response.json();
  writeFileSync(
    `${directory}/branch-denial-${stage}.json`,
    JSON.stringify({ status: response.status(), body }, null, 2),
  );
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(response.status()).toBeLessThan(500);
  expect(body.code).not.toBe(0);
}

let settingsToken: string | undefined;

/** Settings are non-tested prerequisites, changed only in the owned environment. */
async function prepareSetting(
  page: Page,
  _token: string,
  name: string,
  enabled: boolean,
) {
  if (!settingsToken) {
    const loginResponse = await page.request.post(
      `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/auth/login`,
      {
        data: {
          username: `${process.env.QGS_E2E_USERNAME}_settings`,
          password: process.env.QGS_E2E_PASSWORD,
        },
      },
    );
    const identity = await loginResponse.json();
    expect(identity.code, identity.message).toBe(0);
    settingsToken = identity.data.accessToken;
  }
  const response = await page.request.post(
    `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/system/settings/${name}`,
    {
      headers: { Authorization: `Bearer ${settingsToken}` },
      data: { enabled },
    },
  );
  const body = await response.json();
  expect(body.code, body.message).toBe(0);
}

for (const incoming of [false, true]) {
  test(`outsourcing ${incoming ? 'incoming' : 'process'} accepts through UI and rejects a supplier category mismatch`, async ({
    page,
  }) => {
    const token = await login(page);
    await fillRequest(page, `E2E-OUT-${incoming}`, incoming, {
      outsourcing: true,
    });
    const { request, payload } = await submitBranch(page);
    expect(request.responsibilityType).toBe('OUTSOURCING_UNIT');
    expect(request.supplierId).toBe(fixture.outsourcingId);
    expect(request.responsibleDepartmentId).toBe(fixture.departmentId);
    const before = await db.qms_inspection_requests.count();
    await recordDenial(
      page,
      'qms/inspection/requests/v2',
      token,
      { ...payload, supplierId: fixture.supplierId },
      `outsourcing-category-${incoming}`,
    );
    expect(await db.qms_inspection_requests.count()).toBe(before);
    await dispatch(page, request);
    await login(page, '_qc');
    const state = await closePass(page, request);
    assertPassed(state);
    expect(state.inspection.responsibilityType).toBe('OUTSOURCING_UNIT');
    expect(state.inspection.responsibleDepartmentId).toBe(fixture.departmentId);
    expect(state.inspection.supplierId).toBe(fixture.outsourcingId);
    expect(state.inspection.teamId).toBeNull();
  });
}

async function materialState(id: string, stage: string) {
  const state = {
    business: await snapshot(id, stage),
    application: await db.qms_inspection_material_requests.findUniqueOrThrow({
      where: { inspectionRequestId: id },
    }),
  };
  writeFileSync(
    `${directory}/material-${stage}-${id}.json`,
    JSON.stringify(state, null, 2),
  );
  return state;
}

for (const mode of ['LINK_EXISTING', 'CREATE', 'REJECT'] as const) {
  test(`free material ${mode} reviews through UI and preserves canonical state under rejected writes`, async ({
    page,
  }) => {
    let token = await login(page);
    await prepareSetting(page, token, 'incoming-material-free-input', true);
    try {
      const marker = `E2E-MATERIAL-${mode}`;
      await fillRequest(page, marker, true, { freeMaterial: marker });
      const { request } = await submitBranch(page);
      const initial = await materialState(request.id, 'pending');
      expect(initial.application.status).toBe('PENDING');
      expect(initial.business.request.partId).toBeNull();
      // The dispatch UI must present material review before inspector selection.
      await page.goto('/qms/inspection/requests');
      await page
        .locator('tbody tr')
        .filter({ hasText: request.requestNo })
        .getByRole('button', { name: '派单', exact: true })
        .click();
      await expect(page.locator('.ant-modal:visible')).toContainText(
        '需要先审核',
      );
      await expect(
        page.getByRole('button', { name: '审核并继续' }),
      ).toBeVisible();
      await recordDenial(
        page,
        `qms/inspection/requests/${request.id}/dispatch`,
        token,
        { inspectorId: fixture.qcId, priority: 3 },
        `material-pending-${mode}`,
      );
      expect(await materialState(request.id, 'pending-denial')).toEqual(
        initial,
      );
      const readerToken = await login(page, '_reader');
      await page.goto('/qms/inspection/material-requests');
      const readerRow = page.locator('tbody tr').filter({ hasText: marker });
      await expect(readerRow).toBeVisible();
      await expect(
        readerRow.getByRole('button', { name: '审核', exact: true }),
      ).toHaveCount(0);
      await expect(
        readerRow.getByRole('button', { name: '驳回', exact: true }),
      ).toHaveCount(0);
      await recordDenial(
        page,
        `qms/inspection/material-requests/${initial.application.id}/approve`,
        readerToken,
        {
          mode: 'LINK_EXISTING',
          partId: fixture.partId,
          remark: 'Denied reader',
        },
        `material-permission-${mode}`,
      );
      expect(await materialState(request.id, 'review-denial')).toEqual(initial);
      token = await login(page);
      await page.goto('/qms/inspection/material-requests');
      const row = page.locator('tbody tr').filter({ hasText: marker });
      await row
        .getByRole('button', {
          name: mode === 'REJECT' ? '驳回' : '审核',
          exact: true,
        })
        .click();
      const modal = page.locator('.ant-modal:visible');
      if (mode === 'LINK_EXISTING') {
        const field = modal.locator('.ant-form-item').filter({
          has: page
            .locator('.ant-form-item-label')
            .getByText('已有物料', { exact: true }),
        });
        await field.locator('.ant-select').click();
        await field.locator('input').fill('E2E Canonical');
        await page
          .locator(
            '.ant-select-dropdown:visible .ant-select-item-option-content',
          )
          .getByText('E2E Canonical Part', { exact: true })
          .click();
      } else if (mode === 'CREATE') {
        await choose(page, modal, '处理方式', '创建规范物料');
        await modal
          .locator('.ant-form-item')
          .filter({ hasText: '规范物料名称' })
          .locator('input')
          .fill(`${marker}-CANONICAL`);
      }
      await modal.locator('textarea').fill(`E2E ${mode} reviewed`);
      const response = page.waitForResponse((r) =>
        r.url().includes(`/material-requests/${initial.application.id}/`),
      );
      await modal
        .getByRole('button', {
          name: mode === 'REJECT' ? /驳\s*回/ : /通\s*过/,
        })
        .click();
      const reviewed = await response;
      const reviewBody = await reviewed.json();
      writeFileSync(
        `${directory}/material-review-response-${mode}.json`,
        JSON.stringify(
          { status: reviewed.status(), body: reviewBody },
          null,
          2,
        ),
      );
      expect(reviewBody.code, reviewBody.message).toBe(0);
      await expect(modal).toBeHidden();
      const state = await materialState(request.id, 'reviewed');
      expect(state.application.reviewedById).toBe(fixture.userId);
      expect(state.application.reviewRemark).toBe(`E2E ${mode} reviewed`);
      if (mode === 'REJECT') {
        expect(state.application.status).toBe('REJECTED');
        expect(state.business.request.status).toBe('CANCELLED');
        await recordDenial(
          page,
          `qms/inspection/requests/${request.id}/dispatch`,
          token,
          { inspectorId: fixture.qcId, priority: 3 },
          'material-cancelled',
        );
        expect(await materialState(request.id, 'cancelled-denial')).toEqual(
          state,
        );
      } else {
        expect(state.application.status).toBe('APPROVED');
        expect(state.application.resolutionMode).toBe(mode);
        const partId = state.application.resolvedPartId;
        expect(partId).toBeTruthy();
        expect(state.business.request.partId).toBe(partId);
        if (mode === 'LINK_EXISTING') expect(partId).toBe(fixture.partId);
        const part = await db.master_parts.findUniqueOrThrow({
          where: { id: partId },
        });
        expect(part.name).toBe(
          mode === 'CREATE' ? `${marker}-CANONICAL` : 'E2E Canonical Part',
        );
        await dispatch(page, request);
        await login(page, '_qc');
        const accepted = await closePass(page, request);
        expect(accepted.request.status).toBe('CLOSED');
        expect(accepted.task.status).toBe('COMPLETED');
        expect(accepted.inspection.partId).toBe(partId);
        expect(accepted.inspection.result).toBe('PASS');
        expect(accepted.links).toHaveLength(1);
        expect(accepted.links[0].inspectionId).toBe(accepted.inspection.id);
      }
    } catch (error) {
      await page.screenshot({
        path: `${directory}/material-failure-${mode}.png`,
        mask: [page.locator('input')],
      });
      throw error;
    } finally {
      await prepareSetting(page, token, 'incoming-material-free-input', false);
    }
  });
}

test('multiple incoming work orders persist separate request and inspection links through UI acceptance', async ({
  page,
}) => {
  await login(page);
  await fillRequest(page, 'E2E-MULTI-WO', true, { secondWorkOrder: true });
  const { request } = await submitBranch(page);
  const workOrders = await db.qms_inspection_request_work_orders.findMany({
    where: { requestId: request.id },
    orderBy: { workOrderNumber: 'asc' },
  });
  expect(
    workOrders.map((w: { workOrderNumber: string }) => w.workOrderNumber),
  ).toEqual(['E2E-WO-001', 'E2E-WO-002']);
  await dispatch(page, request);
  await login(page, '_qc');
  const state = await closePass(page, request);
  expect(state.request.status).toBe('CLOSED');
  expect(state.links).toHaveLength(2);
  expect(
    state.links
      .map((l: { workOrderNumber: string }) => l.workOrderNumber)
      .sort(),
  ).toEqual(['E2E-WO-001', 'E2E-WO-002']);
  const inspections = await db.inspections.findMany({
    where: {
      id: {
        in: state.links.map((l: { inspectionId: string }) => l.inspectionId),
      },
    },
    orderBy: { workOrderNumber: 'asc' },
  });
  expect(inspections).toHaveLength(2);
  for (const inspection of inspections) {
    expect(inspection.result).toBe('PASS');
    expect(inspection.partId).toBe(fixture.partId);
    expect(inspection.supplierId).toBe(fixture.supplierId);
  }
  writeFileSync(
    `${directory}/multi-work-orders.json`,
    JSON.stringify({ workOrders, links: state.links, inspections }, null, 2),
  );
});

test('multiple incoming work orders reject a nonexistent order with a client error and unchanged data', async ({
  page,
}) => {
  const token = await login(page);
  await fillRequest(page, 'E2E-MULTI-WO-REJECTION', true, {
    secondWorkOrder: true,
  });
  const { request, payload } = await submitBranch(page);
  const before = await snapshot(request.id, 'missing-work-order-before');
  const count = await db.qms_inspection_requests.count();
  const response = await page.request.post(
    `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/inspection/requests/v2`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'e2e-missing-work-order',
      },
      data: {
        ...payload,
        workOrderNumbers: ['E2E-WO-001', 'E2E-NONEXISTENT'],
      },
    },
  );
  const body = await response.json();
  writeFileSync(
    `${directory}/missing-work-order-observation.json`,
    JSON.stringify(
      {
        status: response.status(),
        body,
        countBefore: count,
        countAfter: await db.qms_inspection_requests.count(),
      },
      null,
      2,
    ),
  );
  expect(await snapshot(request.id, 'missing-work-order-after')).toEqual(
    before,
  );
  expect(await db.qms_inspection_requests.count()).toBe(count);
  expect(response.status()).toBeGreaterThanOrEqual(400);
  // A legacy Error currently becomes HTTP 500; preserve the expected client error.
  expect(response.status()).toBeLessThan(500);
  expect(body.code).not.toBe(0);
});

for (const mode of ['ALL', 'PARTIAL'] as const) {
  test(`station ${mode} persists through UI close and blocks omitted stations in UI`, async ({
    page,
  }) => {
    await login(page);
    await fillRequest(page, `E2E-STATIONS-${mode}`, false, {
      workOrder: 'E2E-WO-STATIONS',
    });
    const before = await db.qms_inspection_requests.count();
    await page.getByRole('button', { name: '提交报检', exact: true }).click();
    await expect(page.locator('.ant-message-notice').last()).toContainText(
      '台',
    );
    expect(await db.qms_inspection_requests.count()).toBe(before);
    await choose(
      page,
      page.locator('body'),
      '台数',
      mode === 'ALL' ? '全部台数' : '第 2 台',
    );
    await page.keyboard.press('Escape');
    const { request } = await submitBranch(page);
    const selected = { mode, indexes: mode === 'ALL' ? [] : [2] };
    const initial = await snapshot(request.id, 'station-submitted');
    expect(JSON.parse(initial.request.stationSelection)).toEqual(selected);
    expect(await db.qms_inspection_requests.count()).toBe(before + 1);
    await page.goto('/qms/inspection/requests');
    await page
      .locator('tbody tr')
      .filter({ hasText: request.requestNo })
      .getByRole('button', { name: '详情', exact: true })
      .click();
    await expect(page.locator('.ant-drawer-content:visible')).toContainText(
      mode === 'ALL' ? '全部' : '2',
    );
    await dispatch(page, request);
    await login(page, '_qc');
    const state = await closePass(page, request);
    assertPassed(state);
    expect(JSON.parse(state.inspection.stationSelection)).toEqual(selected);
  });
}

test('server rejects an out-of-range station without creating or changing a request', async ({
  page,
}) => {
  const token = await login(page);
  await fillRequest(page, 'E2E-STATION-BOUND', false, {
    workOrder: 'E2E-WO-STATIONS',
  });
  await choose(page, page.locator('body'), '台数', '第 2 台');
  await page.keyboard.press('Escape');
  const { request, payload } = await submitBranch(page);
  const before = await snapshot(request.id, 'station-bound-before');
  const count = await db.qms_inspection_requests.count();
  const response = await page.request.post(
    `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/inspection/requests/v2`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'e2e-station-out-of-range',
      },
      data: { ...payload, stationSelection: { mode: 'PARTIAL', indexes: [4] } },
    },
  );
  const body = await response.json();
  const persisted = await db.qms_inspection_requests.findMany({
    where: { requestInfo: 'E2E-STATION-BOUND' },
  });
  writeFileSync(
    `${directory}/station-bound-observation.json`,
    JSON.stringify(
      {
        status: response.status(),
        body,
        countBefore: count,
        countAfter: await db.qms_inspection_requests.count(),
        persisted,
      },
      null,
      2,
    ),
  );
  expect(await snapshot(request.id, 'station-bound-after')).toEqual(before);
  // Out-of-range station indexes are a contract rejection, not a server
  // defect: the boundary walk below proves the same rule holds elsewhere.
  expect(response.status()).toBe(400);
  expect(body.error.code).toBe('VALIDATION');
  expect(body.message).toContain('台号必须为 1 至 3 的整数');
  expect(await db.qms_inspection_requests.count()).toBe(count);
  const rejectedSelections = [
    undefined,
    { mode: 'PARTIAL', indexes: [] },
    { mode: 'PARTIAL', indexes: [0] },
    { mode: 'PARTIAL', indexes: [-1] },
    { mode: 'PARTIAL', indexes: [1.5] },
    { mode: 'ALL', indexes: [4] },
    { mode: 'UNKNOWN', indexes: [1] },
    { mode: 'PARTIAL', indexes: [4] },
  ];
  const boundaryEvidence = [];
  for (const isPublic of [false, true]) {
    for (const [index, stationSelection] of rejectedSelections.entries()) {
      const rejected = await page.request.post(
        `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/${isPublic ? 'public/' : ''}inspection/requests/v2`,
        {
          headers: isPublic
            ? {}
            : {
                Authorization: `Bearer ${token}`,
                'Idempotency-Key': `e2e-station-boundary-${index}`,
              },
          data: { ...payload, stationSelection },
        },
      );
      const rejection = await rejected.json();
      expect(rejected.status()).toBeGreaterThanOrEqual(400);
      expect(rejected.status()).toBeLessThan(500);
      expect(rejection.code).not.toBe(0);
      expect(await db.qms_inspection_requests.count()).toBe(count);
      boundaryEvidence.push({
        isPublic,
        stationSelection,
        status: rejected.status(),
        code: rejection.code,
      });
    }
  }
  writeFileSync(
    `${directory}/station-write-boundaries.json`,
    JSON.stringify(boundaryEvidence, null, 2),
  );
});

test('anonymous desktop public entry creates a receipt without identity and denies private dispatch', async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await fillRequest(page, 'E2E-ANONYMOUS');
  const { request, headers } = await submitBranch(page);
  expect(headers.authorization).toBeUndefined();
  expect(headers['idempotency-key']).toBeUndefined();
  const state = await snapshot(request.id, 'anonymous-submitted');
  expect(state.request.reporterId).toBeNull();
  expect(state.request.reporter).toBe('E2E Reporter');
  await expect(
    page
      .locator('.my-inspection-requests')
      .getByText(request.requestNo)
      .first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: '我的报检', exact: true }).click();
  await expect(
    page
      .locator('.my-inspection-requests')
      .getByText(request.requestNo)
      .first(),
  ).toBeVisible();
  const denied = await page.request.post(
    `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/inspection/requests/${request.id}/dispatch`,
    { data: { inspectorId: fixture.qcId, priority: 3 } },
  );
  expect(denied.status()).toBe(401);
  expect(await snapshot(request.id, 'anonymous-denial')).toEqual(state);
  await login(page);
  await dispatch(page, request);
  await login(page, '_qc');
  assertPassed(await closePass(page, request));
});

test('manual incoming inspection creates through UI and disabled setting prevents further records', async ({
  page,
}) => {
  const token = await login(page);
  const beforeRequests = await db.qms_inspection_requests.count();
  const beforeRecords = await db.inspections.count();
  await page.goto('/qms/inspection/records');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const modal = page.locator('.ant-modal:visible');
  const manualChoose = async (label: string, value: string) => {
    await issueField(modal, label).locator('.ant-select').click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .getByText(value, { exact: true })
      .click();
  };
  await manualChoose('工单号', 'E2E-WO-001');
  await manualChoose('进货类型', 'E2E Incoming');
  await manualChoose('单位', 'E2E Supplier');
  const formItem = (label: string) => issueField(modal, label);
  await formItem('物料名称').locator('input').fill('E2E Canonical Part');
  await formItem('数量').locator('input').fill('3');
  await formItem('备注').locator('textarea').fill('E2E-MANUAL-RECORD');
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/inspection/records') &&
      r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  const res = await response;
  const body = await res.json();
  expect(body.code, body.message).toBe(0);
  await expect(modal).toBeHidden();
  const record = await db.inspections.findUniqueOrThrow({
    where: { id: body.data.id },
  });
  expect(record.category).toBe('INCOMING');
  expect(record.result).toBe('PASS');
  expect(record.workOrderNumber).toBe('E2E-WO-001');
  expect(record.supplierId).toBe(fixture.supplierId);
  expect(record.quantity).toBe(3);
  expect(await db.inspections.count()).toBe(beforeRecords + 1);
  expect(await db.qms_inspection_requests.count()).toBe(beforeRequests);
  await page.reload();
  await expect(
    page.locator('.vxe-body--row').filter({ hasText: 'E2E Incoming' }),
  ).toBeVisible();
  writeFileSync(
    `${directory}/manual-record.json`,
    JSON.stringify(record, null, 2),
  );
  await prepareSetting(page, token, 'inspection-manual-create', false);
  try {
    await page.reload();
    await expect(
      page.getByRole('button', { name: '新增', exact: true }),
    ).toHaveCount(0);
    await recordDenial(
      page,
      'qms/inspection/records',
      token,
      res.request().postDataJSON(),
      'manual-disabled',
    );
    expect(await db.inspections.count()).toBe(beforeRecords + 1);
  } finally {
    await prepareSetting(page, token, 'inspection-manual-create', true);
  }
  await login(page, '_reader');
  await page.goto('/qms/inspection/records');
  await expect(
    page.getByRole('button', { name: '新增', exact: true }),
  ).toHaveCount(0);
});
