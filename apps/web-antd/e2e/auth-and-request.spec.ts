import type { Page } from '@playwright/test';

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }, info) => {
  // Playwright's automatic error snapshot includes input values. Reserve this
  // attachment before login so failures only persist masked screenshots.
  await info.attach('error-context', {
    body: Buffer.from(
      'Input snapshots suppressed; see the masked failure screenshot.',
    ),
    contentType: 'text/plain',
  });
  await expect(page).toHaveURL('about:blank');
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({
      path: `${process.env.QGS_E2E_ARTIFACT_DIR}/failure-${info.testId}.png`,
      mask: [page.locator('input')],
    });
  }
});

async function submitLogin(page: Page) {
  const button = page
    .getByRole('button', { name: /登\s*录/ })
    .or(page.locator('button[aria-label="login"]'));
  await expect(button).toBeVisible();
  await button.click();
}

async function login(page: Page) {
  await page.goto('/auth/login?redirect=/qms/inspection/requests');
  await page
    .getByPlaceholder('请输入用户名')
    .fill(process.env.QGS_E2E_USERNAME || '');
  await page
    .getByPlaceholder('密码', { exact: true })
    .fill(process.env.QGS_E2E_PASSWORD || '');
  await submitLogin(page);
  await expect(
    page.getByRole('heading', { name: '报检任务', exact: true }),
  ).toBeVisible();
}

test('rejects an incorrect password through the login UI', async ({ page }) => {
  await page.goto('/auth/login');
  await page
    .getByPlaceholder('请输入用户名')
    .fill(process.env.QGS_E2E_USERNAME || '');
  await page
    .getByPlaceholder('密码', { exact: true })
    .fill(process.env.QGS_E2E_WRONG_PASSWORD || '');
  await submitLogin(page);
  await expect(
    page.getByText('用户名或密码错误', { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login/);
  await page.screenshot({
    path: `${process.env.QGS_E2E_ARTIFACT_DIR}/login-rejected.png`,
    mask: [page.locator('input')],
  });
});

test('logs in, logs out and blocks reopening the protected page', async ({
  page,
}) => {
  await login(page);
  await page.screenshot({
    path: `${process.env.QGS_E2E_ARTIFACT_DIR}/login-success.png`,
  });
  const userMenu = page
    .locator('button[aria-haspopup="menu"]')
    .filter({ hasText: 'ER' });
  await expect(userMenu).toBeVisible();
  await userMenu.click();
  await page.getByRole('menuitem', { name: /退出登录/ }).click();
  const confirmButton = page
    .locator('.ant-modal:visible, [role="dialog"]:visible')
    .getByRole('button', { name: /确\s*认/ });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await page.goto('/qms/inspection/requests');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(
    page.getByRole('heading', { name: '报检任务', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `${process.env.QGS_E2E_ARTIFACT_DIR}/logged-out.png`,
    mask: [page.locator('input')],
  });
});

async function select(page: Page, label: string, option: string) {
  const item = page.locator('.ant-form-item').filter({
    has: page.locator('.ant-form-item-label').getByText(label, { exact: true }),
  });
  await item.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    // Work order options render as "<workOrderNumber> - <projectName>"
    // when the order carries a project, so match the canonical number.
    .getByText(new RegExp(`^${option}(?:\\s|$)`))
    .click();
}

test('creates a request through UI and reopens persisted details after reload', async ({
  page,
}) => {
  await login(page);
  await expect(
    page.locator('tbody tr').filter({ hasText: 'E2E-WO-001' }),
  ).toHaveCount(0);
  await page.goto('/qms/inspection/requests/entry');
  await select(page, '工单号', 'E2E-WO-001');
  await select(page, '工序', 'E2E Fabrication');
  await select(page, '一级部件名称', 'E2E Canonical Part');
  await page.getByPlaceholder('请输入组件名称').fill('E2E Component');
  await page.getByRole('spinbutton').fill('3');
  await select(page, '责任部门', 'E2E Production');
  await page.getByPlaceholder('请输入报检人').fill('E2E Reporter');
  await page.getByPlaceholder('请输入补充说明').fill('E2E isolated UI request');
  const upload = page.waitForResponse(
    (response) =>
      response.url().includes('/upload') &&
      response.request().method() === 'POST',
  );
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'e2e-self-check.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  const uploaded = await upload;
  expect(uploaded.ok()).toBeTruthy();
  await expect(
    page.getByText('e2e-self-check.png', { exact: true }),
  ).toBeVisible();
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith('/requests/v2') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交报检', exact: true }).click();
  const response = await submitted;
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const fixture = JSON.parse(
    readFileSync(`${process.env.QGS_E2E_ARTIFACT_DIR}/seed.json`, 'utf8'),
  );
  expect(body.code).toBe(0);
  expect(body.data.requestNo).toMatch(/^IR-/);
  expect(body.data.partId).toBe(fixture.partId);
  expect(body.data.processId).toBe(fixture.processId);
  expect(body.data.responsibleDepartmentId).toBe(fixture.departmentId);
  expect(body.data.reporterId).toBe(fixture.userId);
  expect(body.data.quantity).toBe(3);
  expect(body.data.componentName).toBe('E2E Component');
  expect(body.data.requestInfo).toBe('E2E isolated UI request');
  await page.goto('/qms/inspection/requests');
  // Dispatch holders must acknowledge the real pending-task alert through UI.
  const alertTaskButton = page
    .locator('.inspection-request-global-alert:visible')
    .getByRole('button', { name: '标记已读' });
  await expect(alertTaskButton).toBeVisible();
  await alertTaskButton.click();
  await expect(alertTaskButton).toBeHidden();
  const row = page.locator('tbody tr').filter({ hasText: body.data.requestNo });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('E2E Canonical Part');
  await expect(row).toContainText('E2E Component');
  await expect(row).toContainText('E2E Reporter');
  await row.getByRole('button', { name: '详情', exact: true }).click();
  const detail = page.locator('.ant-drawer-content:visible');
  await expect(detail).toContainText(body.data.requestNo);
  await expect(detail).toContainText('E2E-WO-001');
  await expect(
    detail.getByRole('link', { name: 'e2e-self-check.png' }),
  ).toBeVisible();
  await page.reload();
  await row.getByRole('button', { name: '详情', exact: true }).click();
  await expect(detail).toContainText('E2E Canonical Part');
  await expect(detail).toContainText('E2E Reporter');
  await expect(detail).toContainText('E2E Component');
  await expect(detail).toContainText('E2E Fabrication');
  await expect(detail).toContainText('E2E Production');
  await expect(detail).toContainText('E2E-WO-001');
  await expect(detail).toContainText(/数量\s*3/);
  await expect(detail).toContainText(body.data.requestNo);
  await expect(
    detail.getByRole('link', { name: 'e2e-self-check.png' }),
  ).toBeVisible();
  await page.screenshot({
    path: `${process.env.QGS_E2E_ARTIFACT_DIR}/request-reopened.png`,
  });
  // Used only by the explicit negative-control run; never a skipped or passing test.
  if (process.env.QGS_E2E_NEGATIVE_CONTROL === '1') {
    await expect(detail).toContainText('INTENTIONALLY ABSENT E2E SENTINEL', {
      timeout: 1000,
    });
  }
});
