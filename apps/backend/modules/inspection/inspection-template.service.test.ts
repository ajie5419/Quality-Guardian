import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionCoreService } from '~/modules/inspection/inspection-core.service';
import { InspectionTemplateService } from '~/modules/inspection/inspection-template.service';

vi.mock('~/modules/inspection/inspection-core.service', () => ({
  InspectionCoreService: {
    findById: vi.fn(),
  },
}));

describe('inspectionTemplateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate findById to InspectionCoreService', () => {
    expect(InspectionTemplateService.findById).toBe(
      InspectionCoreService.findById,
    );
  });
});
