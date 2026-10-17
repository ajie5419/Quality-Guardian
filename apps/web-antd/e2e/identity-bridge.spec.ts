import type { Page } from '@playwright/test';

import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

import { expect, test } from '@playwright/test';

import { assertOwnedTargets } from '../../../scripts/e2e/safety.mjs';

const require = createRequire(
  new URL('../../backend/package.json', import.meta.url),
);
const { PrismaClient } = require('@prisma/client');

const fixture = JSON.parse(
  readFileSync(`${process.env.QGS_E2E_ARTIFACT_DIR}/seed.json`, 'utf8'),
);
const token = () => randomBytes(32).toString('base64url');
test.use({ ignoreHTTPSErrors: true });

async function signIn(page: Page) {
  await page.getByRole('button', { name: '登录 QMS 后继续' }).click();
  await page
    .getByPlaceholder('请输入用户名')
    .fill(`${process.env.QGS_E2E_USERNAME}_identity`);
  await page
    .getByPlaceholder('密码', { exact: true })
    .fill(process.env.QGS_E2E_PASSWORD || '');
  await page
    .getByRole('button', { name: /登\s*录/ })
    .or(page.locator('button[aria-label="login"]'))
    .click();
  await expect(
    page.getByRole('heading', { name: '登录履约系统', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '继续', exact: true }),
  ).toBeVisible();
}

test('employee with no QMS menus returns to fixed authorization and uses only an integration credential', async ({
  page,
}, info) => {
  await info.attach('error-context', {
    body: Buffer.from('Input snapshots suppressed for identity login.'),
    contentType: 'text/plain',
  });
  await assertOwnedTargets(process.env);
  const db = new PrismaClient();
  let codesRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/codes') codesRequests++;
  });
  try {
    const employee = await db.users.findUniqueOrThrow({
      where: { id: fixture.identityUserId },
    });
    expect(
      await db.rbac_role_permissions.count({
        where: {
          roleId: employee.roleId,
        },
      }),
    ).toBe(0);
    const gc = process.env.GC_IDENTITY_E2E_ORIGIN;
    if (gc) {
      await page.goto(`${gc}/work-orders`);
      await page.getByRole('link', { name: '登录', exact: true }).click();
      await signIn(page);
      expect(codesRequests).toBe(0);
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await expect(
        page.getByText('当前登录：E2E Identity Employee'),
      ).toBeVisible();
      await page.screenshot({
        path: `${process.env.QGS_E2E_ARTIFACT_DIR}/identity-logged-in.png`,
      });
      const cookies = await page.context().cookies(gc);
      const session = cookies.find(
        (cookie) => cookie.name === '__Host-gc-session',
      );
      expect(
        Boolean(
          session?.secure &&
            session.httpOnly &&
            session.sameSite === 'Lax' &&
            session.path === '/',
        ),
      ).toBe(true);
      await page
        .locator('#order-number')
        .fill(`IDENTITY-${process.env.QGS_E2E_RUN_ID}`);
      await page.locator('#customer').fill('Isolated identity customer');
      await page.locator('#due-date').fill('2026-12-20');
      await page.getByRole('button', { name: '保存工单', exact: true }).click();
      await expect(page.getByText('工单已创建', { exact: true })).toBeVisible();
      const orders = await page.request.get(`${gc}/api/work-orders`);
      expect(orders.status()).toBe(200);
      const persisted = await orders.json();
      expect(
        persisted.data.some(
          (order: { number: string; productionLeadId: null | string }) =>
            order.number === `IDENTITY-${process.env.QGS_E2E_RUN_ID}` &&
            order.productionLeadId === null,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${process.env.QGS_E2E_ARTIFACT_DIR}/identity-order-created.png`,
      });
      await page.getByRole('button', { name: '退出履约系统' }).click();
      await expect(
        page.getByText('已退出履约系统。', { exact: true }),
      ).toBeVisible();
      const afterLogout = await page.request.get(`${gc}/api/work-orders`);
      expect(afterLogout.status()).toBe(403);
      await page.getByRole('link', { name: '登录', exact: true }).click();
      await page.getByRole('button', { name: '继续', exact: true }).click();
      await expect(
        page.getByText('当前登录：E2E Identity Employee'),
      ).toBeVisible();
      await db.users.update({
        where: { id: fixture.identityUserId },
        data: { status: 'INACTIVE' },
      });
      await page.getByRole('button', { name: '重新读取', exact: true }).click();
      await expect(
        page.getByText('当前登录：E2E Identity Employee'),
      ).toHaveCount(0);
      await expect(
        page.getByText(`IDENTITY-${process.env.QGS_E2E_RUN_ID}`, {
          exact: true,
        }),
      ).toHaveCount(0);
      const afterDisable = await page.request.get(`${gc}/api/work-orders`);
      expect(afterDisable.status()).toBe(403);
      await page.screenshot({
        path: `${process.env.QGS_E2E_ARTIFACT_DIR}/identity-disabled.png`,
        mask: [page.locator('input')],
      });
      return;
    }
    // Standalone QMS suite verifies its own authorization page and real Nitro endpoints.
    const verifier = token();
    const params = new URLSearchParams({
      clientId: process.env.QMS_IDENTITY_CLIENT_ID || '',
      redirectUri: process.env.QMS_IDENTITY_CALLBACK || '',
      state: token(),
      challenge: createHash('sha256').update(verifier).digest('base64url'),
      method: 'S256',
    });
    await page.route('https://gc.e2e.invalid/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'QMS callback observed; standalone provider test only.',
      }),
    );
    await page.goto(`/identity/authorize?${params}`);
    await signIn(page);
    expect(codesRequests).toBe(0);
    const authorized = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/identity-bridge/authorize' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '继续', exact: true }).click();
    const authorization = await authorized;
    const body = await authorization.json();
    const callback = new URL(body.data.callback);
    expect(callback.origin + callback.pathname).toBe(
      process.env.QMS_IDENTITY_CALLBACK,
    );
    const headers = {
      'x-identity-client-id': process.env.QMS_IDENTITY_CLIENT_ID || '',
      'x-identity-client-secret': process.env.QMS_IDENTITY_CLIENT_SECRET || '',
    };
    const base = process.env.QGS_E2E_BACKEND_ORIGIN;
    const exchange = {
      code: callback.searchParams.get('code'),
      redirectUri: process.env.QMS_IDENTITY_CALLBACK,
      verifier,
    };
    const grant = await page.request.post(
      `${base}/api/identity-bridge/exchange`,
      { headers, data: exchange },
    );
    expect(grant.status()).toBe(200);
    const grantBody = await grant.json();
    const credential = grantBody.data.credential;
    const auth = { ...headers, authorization: `Bearer ${credential}` };
    for (let attempt = 0; attempt < 2; attempt++) {
      const identity = await page.request.post(
        `${base}/api/identity-bridge/identity`,
        { headers: auth, data: {} },
      );
      expect(identity.status()).toBe(200);
      const identityBody = await identity.json();
      expect(identityBody.data).toEqual({
        id: fixture.identityUserId,
        name: 'E2E Identity Employee',
        active: true,
      });
    }
    const replay = await page.request.post(
      `${base}/api/identity-bridge/exchange`,
      {
        headers,
        data: exchange,
      },
    );
    expect(replay.status()).toBe(401);
    const businessAccess = await page.request.get(`${base}/api/user/info`, {
      headers: { authorization: `Bearer ${credential}` },
    });
    expect(businessAccess.status()).toBe(401);
    const revoked = await page.request.post(
      `${base}/api/identity-bridge/revoke`,
      {
        headers: auth,
        data: {},
      },
    );
    expect(revoked.status()).toBe(200);
    const revokedAgain = await page.request.post(
      `${base}/api/identity-bridge/revoke`,
      {
        headers: auth,
        data: {},
      },
    );
    expect(revokedAgain.status()).toBe(200);
    const afterRevoke = await page.request.post(
      `${base}/api/identity-bridge/identity`,
      {
        headers: auth,
        data: {},
      },
    );
    expect(afterRevoke.status()).toBe(401);
  } finally {
    await db.users.update({
      where: { id: fixture.identityUserId },
      data: { status: 'ACTIVE' },
    });
    await db.$disconnect();
  }
});
