import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { workOrderModule } from './work-order.module';

describe('work order module menu declaration', () => {
  it('synchronizes the existing work-order menu and its confirm button', () => {
    expect(workOrderModule.menus).toContainEqual(
      expect.objectContaining({
        authCode: 'QMS:WorkOrder:List',
        component: 'qms/work-order/index',
        name: 'QMSWorkOrder',
        path: '/qms/work-order',
        buttons: [
          expect.objectContaining({
            authCode: 'QMS:WorkOrder:Confirm',
            name: 'QMSWorkOrderConfirm',
          }),
        ],
      }),
    );
  });

  it('seeds the confirm button for new environments', () => {
    const cwd = process.cwd();
    const backendRoot =
      basename(cwd) === 'backend' && basename(dirname(cwd)) === 'apps'
        ? cwd
        : resolve(cwd, 'apps/backend');
    const seed = readFileSync(resolve(backendRoot, 'prisma/seed.js'), 'utf8');

    expect(seed).toContain('id: 2305,');
    expect(seed).toContain("name: 'QMSWorkOrderConfirm',");
    expect(seed).toContain("authCode: 'QMS:WorkOrder:Confirm',");
    expect(seed).toContain("meta: { title: '确认/撤销' },");
  });
});
