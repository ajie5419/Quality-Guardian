import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionService } from '~/modules/inspection/inspection.service';

import {
  buildInspectionRecordFromRequest,
  INCOMING_INSPECTION_PROCESS_NAME,
} from './inspection-request';

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    create: vi.fn(),
  },
}));

describe('inspection request helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (InspectionService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'inspection-1',
    });
  });

  it('keeps incoming requests as incoming records when process relation is missing', async () => {
    await buildInspectionRecordFromRequest(
      {
        componentName: '',
        mutualCheckResult: 'PASS',
        partName: 'Bearing',
        process: { name: '' },
        processName: INCOMING_INSPECTION_PROCESS_NAME,
        quantity: 10,
        reporter: 'Reporter A',
        requestInfo: JSON.stringify({
          incomingType: '外购件',
          notes: 'Incoming batch',
        }),
        selfCheckResult: 'PASS',
        team: 'Supplier A',
        work_order: { projectName: 'Project A' },
        workOrderNumber: 'WO-001',
      },
      {
        inspector: 'Inspector A',
        result: 'PASS',
      },
    );

    expect(InspectionService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'INCOMING',
        incomingType: '外购件',
        materialName: 'Bearing',
        supplierName: 'Supplier A',
      }),
    );
  });
});
