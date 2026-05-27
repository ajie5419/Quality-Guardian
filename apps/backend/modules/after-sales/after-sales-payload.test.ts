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

  it('serializes responsibleDepartments and keeps legacy fields on create', async () => {
    await expect(
      buildGovernedAfterSalesCreateData(
        {
          projectName: 'Project',
          responsibleDept: '质量部',
          responsibleDepartments: ['售后部', '技术部'],
          workOrderNumber: 'WO-808512',
        },
        {
          defaultWorkOrderNumber: 'UNKNOWN',
          id: 'AS-UT-002',
          serialNumber: 2,
        },
      ),
    ).resolves.toMatchObject({
      feedbackDept: '售后部',
      respDept: '售后部',
      responsibleDepartments: JSON.stringify(['售后部', '技术部']),
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

  it('serializes responsibleDepartments and keeps legacy fields on update', async () => {
    await expect(
      buildGovernedAfterSalesUpdateData({
        responsibleDept: '质量部',
        responsibleDepartments: ['生产部', '工艺部'],
      }),
    ).resolves.toMatchObject({
      costsChanged: false,
      data: {
        feedbackDept: '生产部',
        respDept: '生产部',
        responsibleDepartments: JSON.stringify(['生产部', '工艺部']),
      },
    });
  });
});
