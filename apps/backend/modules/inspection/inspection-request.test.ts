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
      undefined,
    );
  });

  it('honors an explicit hasDocuments choice over attachment count', async () => {
    await buildInspectionRecordFromRequest(
      {
        attachments: [
          { name: 'self-check.pdf', url: 'https://example.com/self.pdf' },
        ],
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
        attachments: [{ name: 'record.pdf', url: 'https://example.com/r.pdf' }],
        hasDocuments: false,
        inspector: 'Inspector A',
        result: 'PASS',
      },
    );

    expect(InspectionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ hasDocuments: false }),
      undefined,
    );
  });

  it('falls back to attachment count when hasDocuments is not provided', async () => {
    await buildInspectionRecordFromRequest(
      {
        attachments: [
          { name: 'self-check.pdf', url: 'https://example.com/self.pdf' },
        ],
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
        attachments: [{ name: 'record.pdf', url: 'https://example.com/r.pdf' }],
        inspector: 'Inspector A',
        result: 'PASS',
      },
    );

    expect(InspectionService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        hasDocuments: true,
        hasSelfCheckDocuments: true,
      }),
      undefined,
    );
    const payload = (InspectionService.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(JSON.parse(String(payload.selfCheckDocuments))).toEqual([
      expect.objectContaining({
        name: 'self-check.pdf',
        url: 'https://example.com/self.pdf',
      }),
    ]);
  });
});
