import { describe, expect, it } from 'vitest';

import {
  buildGovernedAfterSalesCreateData,
  buildGovernedAfterSalesUpdateData,
} from './after-sales-payload';

describe('after-sales payload governance helpers', () => {
  it('builds governed create payload without runtime reference error', async () => {
    await expect(
      buildGovernedAfterSalesCreateData(
        {
          customerName: 'ACME',
          defectSubtype: '平板车',
          defectType: '焊接缺陷',
          partName: '阿萨德',
          projectName: '阿斯蒂芬',
          responsibleDepartment: '生产 OBU',
          workOrderNumber: 'WO-808512',
        },
        {
          defaultWorkOrderNumber: 'UNKNOWN',
          id: 'AS-UT-001',
          serialNumber: 1,
        },
      ),
    ).resolves.toMatchObject({
      id: 'AS-UT-001',
      workOrderNumber: 'WO-808512',
    });
  });

  it('builds governed update payload without runtime reference error', async () => {
    await expect(
      buildGovernedAfterSalesUpdateData({
        customerName: 'ACME',
        defectSubtype: '平板车',
        defectType: '焊接缺陷',
        responsibleDepartment: '生产 OBU',
      }),
    ).resolves.toMatchObject({
      costsChanged: false,
      data: expect.any(Object),
    });
  });
});
