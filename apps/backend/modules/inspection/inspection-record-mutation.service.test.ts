import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRecordCreateService } from '~/modules/inspection/inspection-record-create.service';
import { InspectionRecordDeleteService } from '~/modules/inspection/inspection-record-delete.service';
import { InspectionRecordMutationService } from '~/modules/inspection/inspection-record-mutation.service';
import { InspectionRecordUpdateService } from '~/modules/inspection/inspection-record-update.service';

vi.mock('~/modules/inspection/inspection-record-create.service', () => ({
  InspectionRecordCreateService: {
    create: vi.fn().mockResolvedValue({ id: 'i-1' }),
    generateSerialNumber: vi.fn().mockResolvedValue('INS-001'),
  },
}));

vi.mock('~/modules/inspection/inspection-record-update.service', () => ({
  InspectionRecordUpdateService: {
    update: vi.fn().mockResolvedValue({ id: 'i-1' }),
  },
}));

vi.mock('~/modules/inspection/inspection-record-delete.service', () => ({
  InspectionRecordDeleteService: {
    batchDelete: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({ id: 'i-1' }),
  },
}));

describe('inspectionRecordMutationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have generateSerialNumber from create service', async () => {
    const _result =
      await InspectionRecordMutationService.generateSerialNumber();
    expect(
      InspectionRecordCreateService.generateSerialNumber,
    ).toHaveBeenCalled();
  });

  it('should have create from create service', async () => {
    const result = await InspectionRecordMutationService.create({} as any);
    expect(InspectionRecordCreateService.create).toHaveBeenCalled();
    expect(result).toEqual({ id: 'i-1' });
  });

  it('should have update from update service', async () => {
    const result = await InspectionRecordMutationService.update(
      'i-1',
      {} as any,
    );
    expect(InspectionRecordUpdateService.update).toHaveBeenCalled();
    expect(result).toEqual({ id: 'i-1' });
  });

  it('should have delete from delete service', async () => {
    const result = await InspectionRecordMutationService.delete('i-1');
    expect(InspectionRecordDeleteService.delete).toHaveBeenCalled();
    expect(result).toEqual({ id: 'i-1' });
  });

  it('should have batchDelete from delete service', async () => {
    const result = await InspectionRecordMutationService.batchDelete(['i-1']);
    expect(InspectionRecordDeleteService.batchDelete).toHaveBeenCalled();
    expect(result).toEqual({ count: 1 });
  });
});
