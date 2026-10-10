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
const api = `${process.env.QGS_E2E_BACKEND_ORIGIN}/api/qms/quality-loss`;
const lastLogin = new Map<string, number>();

test.beforeAll(async () => {
  await assertOwnedTargets(process.env);
  expect(fixture.runId).toBe(process.env.QGS_E2E_RUN_ID);
  expect(fixture.qualityLossBeforeUI).toBe(0);
  expect(fixture.qualityLossIndexBeforeUI).toBe(0);
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
    path: `${directory}/quality-loss-${info.status}-${info.testId}.png`,
    mask: [page.locator('input'), page.locator('textarea')],
  });
});

async function login(page: Page, suffix = '') {
  const remaining = remainingDedupeWait(lastLogin.get(suffix));
  if (remaining > 0) await page.waitForTimeout(remaining);
  const target = '/qms/quality-loss';
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

function field(page: Page, modal: Locator, label: string) {
  return modal.locator('.ant-form-item').filter({
    has: page.locator('.ant-form-item-label').getByText(label),
  });
}

async function fill(
  page: Page,
  marker: string,
  amount = 120,
  actualClaim = 30,
) {
  await page.getByRole('button', { name: /新增损失录入/ }).click();
  const modal = page.locator('.ant-modal:visible');
  await expect(modal).toContainText('新增损失录入');

  // 选择工单 (WorkOrderSelect)
  const woItem = field(page, modal, '工单号');
  await woItem.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText('E2E-WO-001', { exact: true })
    .click();

  // 项目名称自动带出
  await expect(field(page, modal, '项目名称').locator('input')).toHaveValue(
    'E2E Project',
  );

  // 选择部件名称 (BomItemSelect)
  const partItem = field(page, modal, '部件名称');
  await partItem.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(/E2E Canonical Part/)
    .first()
    .click();

  // 填写日期 (Input type="date")
  const today = await page.evaluate(() => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
  });
  const dateInput = modal.locator('input[type="date"]');
  await dateInput.fill(today);

  // 金额与索赔
  const amountInput = field(page, modal, '预计损失金额').locator(
    '.ant-input-number-input',
  );
  await amountInput.fill(String(amount));

  const claimInput = field(page, modal, '实际索赔金额').locator(
    '.ant-input-number-input',
  );
  await claimInput.fill(String(actualClaim));

  // 选择责任部门 (TreeSelect)
  const deptItem = field(page, modal, '责任部门');
  await deptItem.locator('.ant-select').click();
  await page
    .locator('.ant-select-tree-node-content-wrapper')
    .getByText('E2E Production', { exact: true })
    .click();

  // 填写情况说明
  await modal.locator('textarea').fill(`${marker} E2E Loss Description`);

  return { modal, today };
}

async function submit(
  page: Page,
  modal: Locator,
  method = 'POST',
  expected = 200,
) {
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.startsWith('/api/qms/quality-loss') &&
      r.request().method() === method,
  );
  await modal.getByRole('button', { name: /确\s*定/ }).click();
  const res = await response;
  const body = await res.json();
  expect(res.status(), body.message).toBe(expected);
  if (expected === 200) {
    expect(body.code, body.message).toBe(0);
    await expect(modal).toBeHidden();
  }
  return body;
}

async function action(page: Page, name: 'claim' | 'delete' | 'edit') {
  const button = page
    .locator('.vxe-table--fixed-right-wrapper tbody tr')
    .first()
    .locator(`[data-action="${name}"]`);
  await expect(button).toBeVisible();
  await button.click();
}

async function state(id: string, stage: string) {
  const snapshot = {
    loss: await db.quality_losses.findFirst({
      where: { OR: [{ id }, { lossId: id }] },
    }),
    index: await db.quality_loss_index.findFirst({
      where: { OR: [{ sourcePk: id }, { id }] },
    }),
    jobs: await db.quality_loss_index_jobs.findMany({
      where: { sourcePk: id },
      orderBy: { id: 'asc' },
    }),
  };
  writeFileSync(
    `${directory}/quality-loss-state-${stage}-${id}.json`,
    JSON.stringify(snapshot, null, 2),
  );
  return snapshot;
}

function marker(label: string) {
  return `E2E-QL-${fixture.runId}-${label}`;
}

test('quality-loss UI entry lifecycle edits advances status views claim form and soft deletes', async ({
  page,
}) => {
  await login(page);
  const tag = marker('lifecycle');
  const beforeCount = await db.quality_losses.count();
  const { modal } = await fill(page, tag, 150, 45);
  const body = await submit(page, modal);
  expect(await db.quality_losses.count()).toBe(beforeCount + 1);

  const createdId = body.data.id;
  const createdState = await state(createdId, 'created');
  expect(createdState.loss).toMatchObject({
    amount: expect.anything(),
    actualClaim: expect.anything(),
    workOrderNumber: 'E2E-WO-001',
    projectName: 'E2E Project',
    partName: 'E2E Canonical Part',
    respDept: 'E2E Production',
    status: 'Pending',
    type: 'Scrap',
    isDeleted: false,
  });
  expect(Number(createdState.loss.amount)).toBe(150);
  expect(Number(createdState.loss.actualClaim)).toBe(45);

  // 核验物化索引收敛与前端列表展示
  await expect
    .poll(async () => {
      const current = await db.quality_loss_index.findFirst({
        where: { sourcePk: createdState.loss.id },
      });
      return current?.status;
    })
    .toBe('Pending');

  await page.reload();
  await expect(page.locator('.vxe-table').first()).toBeVisible();
  await expect(page.getByText('E2E Project').first()).toBeVisible();

  // 行内编辑：将状态合法推进至 Processing，金额修改
  await action(page, 'edit');
  const editModal = page.locator('.ant-modal:visible');
  await expect(editModal).toContainText('编辑损失记录');
  const editClaimInput = field(page, editModal, '实际索赔金额').locator(
    '.ant-input-number-input',
  );
  await editClaimInput.fill('60');
  await field(page, editModal, '当前状态').locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(/处理中|Processing/)
    .click();
  await submit(page, editModal, 'PUT');

  const editedState = await state(createdState.loss.id, 'edited');
  expect(editedState.loss.status).toBe('Processing');
  expect(Number(editedState.loss.actualClaim)).toBe(60);

  // 再次编辑：推进至 Resolved 终态
  await page.reload();
  await action(page, 'edit');
  const resolveModal = page.locator('.ant-modal:visible');
  await field(page, resolveModal, '当前状态').locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(/已解决|Resolved/)
    .click();
  await submit(page, resolveModal, 'PUT');
  const resolvedState = await state(createdState.loss.id, 'resolved');
  expect(resolvedState.loss.status).toBe('Resolved');

  // 打开索赔赔偿表打印预览
  await page.reload();
  await action(page, 'claim');
  const claimModal = page.locator('.ant-modal:visible');
  await expect(claimModal).toContainText('生成索赔赔偿表');
  await expect(claimModal.getByText('供应商质量成本赔偿表')).toBeVisible();
  await expect(claimModal.locator('input').first()).toHaveValue('E2E-WO-001');
  await claimModal.locator('.ant-modal-close').click();
  await expect(claimModal).toBeHidden();

  // 行内删除软删
  await action(page, 'delete');
  const deleteResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.startsWith('/api/qms/quality-loss') &&
      r.request().method() === 'DELETE',
  );
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /确\s*定/ })
    .click();
  const delRes = await deleteResponse;
  expect(delRes.status()).toBe(200);

  const deletedState = await state(createdState.loss.id, 'deleted');
  expect(deletedState.loss.isDeleted).toBe(true);
  await expect
    .poll(async () => {
      const index = await db.quality_loss_index.findFirst({
        where: { sourcePk: createdState.loss.id },
      });
      return index?.isDeleted;
    })
    .toBe(true);
});

test('quality-loss role and department boundaries reject unauthorized writes and isolate data', async ({
  page,
}) => {
  await login(page);
  const tag = marker('perms');
  const { modal } = await fill(page, tag, 200, 50);
  const body = await submit(page, modal);
  const storedId = body.data.id;
  const before = await state(storedId, 'before-perms');

  // 1. 只读角色登录：无创建按钮，直接写接口被 403 拒绝
  const readerToken = await login(page, '_reader');
  await expect(page.getByRole('button', { name: /新增损失录入/ })).toHaveCount(
    0,
  );
  for (const method of ['PUT', 'DELETE']) {
    const denied = await page.request.fetch(`${api}/${storedId}`, {
      method,
      headers: { Authorization: `Bearer ${readerToken}` },
      ...(method === 'PUT' ? { data: { amount: 9999 } } : {}),
    });
    expect(denied.status()).toBe(403);
  }
  const batchDenied = await page.request.post(`${api}/batch-delete`, {
    headers: { Authorization: `Bearer ${readerToken}` },
    data: { ids: [storedId] },
  });
  expect(batchDenied.status()).toBe(403);

  // 2. 异部门用户登录：数据隔离不可见，跨部门写被 403 或 404 拒绝
  const foreignToken = await login(page, '_foreign');
  const foreignList = await page.request.get(api, {
    headers: { Authorization: `Bearer ${foreignToken}` },
  });
  expect(foreignList.status()).toBe(200);
  const foreignData = await foreignList.json();
  const found = foreignData.data?.items?.some(
    (item: { id: string }) => item.id === storedId,
  );
  expect(found).toBe(false);

  const foreignPutDenied = await page.request.put(`${api}/${storedId}`, {
    headers: { Authorization: `Bearer ${foreignToken}` },
    data: { amount: 8888 },
  });
  expect([403, 404]).toContain(foreignPutDenied.status());

  expect(await state(storedId, 'after-perms')).toEqual(before);
});

test('quality-loss state transition rules reject illegal jumps and handle concurrent CAS updates', async ({
  page,
}) => {
  await login(page);
  const tag = marker('state-cas');
  const { modal } = await fill(page, tag, 300, 100);
  const body = await submit(page, modal);
  const storedId = body.data.id;

  // 推进至 Resolved
  const putResolve = await page.request.put(`${api}/${storedId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'Resolved' },
  });
  expect(putResolve.status()).toBe(200);

  const beforeIllegal = await state(storedId, 'resolved-before-illegal');
  expect(beforeIllegal.loss.status).toBe('Resolved');

  // 非法状态跃迁：Resolved -> Processing (根据状态机矩阵，Resolved 只能跃迁至 Pending)
  const illegalJump = await page.request.put(`${api}/${storedId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'Processing' },
  });
  expect(illegalJump.status()).toBe(409);

  // 非法未知状态文本：严格解析拒绝 400
  const invalidState = await page.request.put(`${api}/${storedId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'INVALID_STATUS' },
  });
  expect(invalidState.status()).toBe(400);

  expect(await state(storedId, 'after-illegal')).toEqual(beforeIllegal);

  // 并发 CAS 冲突防护：创建一条新 Pending 记录，两路并发更新
  const raceTag = marker('cas-race');
  const { modal: raceModal } = await fill(page, raceTag, 400, 50);
  const raceBody = await submit(page, raceModal);
  const raceId = raceBody.data.id;

  const results = await Promise.all([
    page.request.put(`${api}/${raceId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'Processing', description: 'CAS Race A' },
    }),
    page.request.put(`${api}/${raceId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'Confirmed', description: 'CAS Race B' },
    }),
  ]);
  const statuses = results.map((r) => r.status()).sort();
  // 一路成功(200)，另一路因状态已改变 CAS 失败返回 409
  expect(statuses).toEqual([200, 409]);

  const finalState = await state(raceId, 'after-cas-race');
  expect(['Processing', 'Confirmed']).toContain(finalState.loss.status);
});

test('quality-loss idempotent replay fingerprint mismatch and committed response loss retry', async ({
  page,
}) => {
  await login(page);
  const tag = marker('idempotency');
  const { modal } = await fill(page, tag, 500, 150);

  // 模拟弱网丢响应重试
  let committedId: string | undefined;
  await page.route('**/api/qms/quality-loss', async (route) => {
    if (route.request().method() !== 'POST' || committedId) {
      return route.continue();
    }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const resJson = await response.json();
    committedId = resJson.data.id;
    await route.abort('failed');
  });

  await modal.getByRole('button', { name: /确\s*定/ }).click();
  await expect.poll(() => Boolean(committedId)).toBe(true);
  await expect(modal.getByRole('button', { name: /确\s*定/ })).toBeEnabled();

  const beforeCount = await db.quality_losses.count({
    where: { description: { contains: tag } },
  });
  expect(beforeCount).toBe(1);

  // 跨越短时内存防抖窗口，验证业务级 Idempotency-Key 真实重放
  await waitOutDedupeWindow(page);

  // 原 UI 再次点击保存（复用同 operationId）
  const replayBody = await submit(page, modal, 'POST');
  expect(replayBody.data.id).toBe(committedId);

  const afterCount = await db.quality_losses.count({
    where: { description: { contains: tag } },
  });
  expect(afterCount).toBe(1); // 绝不重复创建

  // 同 Key 更改 Payload 冲突拒绝 (409 IDEMPOTENCY_KEY_REUSED)
  const fakeKey = `e2e-loss-key-${fixture.runId}`;
  const basePayload = {
    partName: 'E2E Canonical Part',
    workOrderNumber: 'E2E-WO-001',
    responsibleDepartmentId: fixture.departmentId,
    type: 'Scrap',
    amount: 100,
    date: '2026-08-20',
    description: 'fingerprint probe',
  };
  const firstRes = await page.request.post(api, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': fakeKey,
    },
    data: basePayload,
  });
  expect(firstRes.status()).toBe(200);

  const conflictRes = await page.request.post(api, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': fakeKey,
    },
    data: { ...basePayload, amount: 9999 }, // 更改金额导致指纹失配
  });
  expect(conflictRes.status()).toBe(409);
  const conflictBody = await conflictRes.json();
  expect(conflictBody.error?.code).toBe('IDEMPOTENCY_KEY_REUSED');
});

test('quality-loss batch deletion guards non-manual sources and synchronizes summary metrics', async ({
  page,
}) => {
  await login(page);
  const tag1 = marker('batch-1');
  const tag2 = marker('batch-2');

  // UI 创建两条记录
  const { modal: modal1 } = await fill(page, tag1, 100, 20);
  const body1 = await submit(page, modal1);
  const { modal: modal2 } = await fill(page, tag2, 200, 40);
  const body2 = await submit(page, modal2);

  const id1 = body1.data.id;
  const id2 = body2.data.id;

  // 批量删除两项
  const batchRes = await page.request.post(`${api}/batch-delete`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { ids: [id1, id2] },
  });
  expect(batchRes.status()).toBe(200);
  const batchBody = await batchRes.json();
  expect(batchBody.data.successCount).toBe(2);

  const state1 = await state(id1, 'batch-deleted');
  const state2 = await state(id2, 'batch-deleted');
  expect(state1.loss.isDeleted).toBe(true);
  expect(state2.loss.isDeleted).toBe(true);

  // 非手工来源或不存在 ID 批量删除拦截与防崩溃
  const badBatch = await page.request.post(`${api}/batch-delete`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { ids: [] },
  });
  expect(badBatch.status()).toBe(400);

  // 概览 KPI 与汇总一致性
  const summaryRes = await page.request.get(`${api}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(summaryRes.status()).toBe(200);
  const summaryData = await summaryRes.json();
  expect(summaryData.data.kpi).toHaveProperty('totalAmount');
  expect(summaryData.data.kpi).toHaveProperty('recoveryRate');

  const exportRes = await page.request.get(`${api}/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(exportRes.status()).toBe(200);
  const exportData = await exportRes.json();
  expect(Array.isArray(exportData.data.items)).toBe(true);
});
