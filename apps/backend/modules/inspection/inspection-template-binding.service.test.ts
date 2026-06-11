import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveInspectionTemplateBinding } from '~/modules/inspection/inspection-template-binding.service';

vi.mock('~/modules/inspection/inspection-form', () => ({
  buildInspectionFormProcessFilter: vi.fn(),
}));

describe('resolveInspectionTemplateBinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockTx = {
    inspection_form_templates: {
      findFirst: vi.fn(),
    },
  } as any;

  it('should return direct templateId when provided', async () => {
    const result = await resolveInspectionTemplateBinding(mockTx, {
      templateId: 'tpl-1',
      templateName: 'Template 1',
    } as any);

    expect(result).toEqual({
      templateId: 'tpl-1',
      templateName: 'Template 1',
    });
    expect(mockTx.inspection_form_templates.findFirst).not.toHaveBeenCalled();
  });

  it('should return direct templateName when only templateName provided', async () => {
    const result = await resolveInspectionTemplateBinding(mockTx, {
      templateName: 'Template A',
    } as any);

    expect(result).toEqual({
      templateId: null,
      templateName: 'Template A',
    });
  });

  it('should return null when no workOrderNumber and no direct template', async () => {
    const result = await resolveInspectionTemplateBinding(mockTx, {
      workOrderNumber: '',
    } as any);

    expect(result).toEqual({
      templateId: null,
      templateName: null,
    });
  });

  it('should return null when process filter is empty', async () => {
    const { buildInspectionFormProcessFilter } = await import(
      '~/modules/inspection/inspection-form'
    );
    vi.mocked(buildInspectionFormProcessFilter).mockResolvedValue({});

    const result = await resolveInspectionTemplateBinding(mockTx, {
      workOrderNumber: 'WO-1',
      processName: '焊接',
    } as any);

    expect(result).toEqual({
      templateId: null,
      templateName: null,
    });
  });

  it('should match template by part name', async () => {
    const { buildInspectionFormProcessFilter } = await import(
      '~/modules/inspection/inspection-form'
    );
    vi.mocked(buildInspectionFormProcessFilter).mockResolvedValue({
      processId: 'p1',
    });
    mockTx.inspection_form_templates.findFirst.mockResolvedValue({
      id: 'tpl-matched',
      formName: 'Matched Template',
    });

    const result = await resolveInspectionTemplateBinding(mockTx, {
      workOrderNumber: 'WO-1',
      processName: '焊接',
      materialName: '钢板',
    } as any);

    expect(result).toEqual({
      templateId: 'tpl-matched',
      templateName: 'Matched Template',
    });
  });

  it('should fallback to empty-part template when no part match', async () => {
    const { buildInspectionFormProcessFilter } = await import(
      '~/modules/inspection/inspection-form'
    );
    vi.mocked(buildInspectionFormProcessFilter).mockResolvedValue({
      processId: 'p1',
    });
    mockTx.inspection_form_templates.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'tpl-fallback',
        formName: 'Fallback Template',
      });

    const result = await resolveInspectionTemplateBinding(mockTx, {
      workOrderNumber: 'WO-1',
      processName: '焊接',
      materialName: '钢板',
    } as any);

    expect(result).toEqual({
      templateId: 'tpl-fallback',
      templateName: 'Fallback Template',
    });
  });

  it('should return null when no template matches at all', async () => {
    const { buildInspectionFormProcessFilter } = await import(
      '~/modules/inspection/inspection-form'
    );
    vi.mocked(buildInspectionFormProcessFilter).mockResolvedValue({
      processId: 'p1',
    });
    mockTx.inspection_form_templates.findFirst.mockResolvedValue(null);

    const result = await resolveInspectionTemplateBinding(mockTx, {
      workOrderNumber: 'WO-1',
      processName: '焊接',
    } as any);

    expect(result).toEqual({
      templateId: null,
      templateName: null,
    });
  });

  it('should try multiple part candidates', async () => {
    const { buildInspectionFormProcessFilter } = await import(
      '~/modules/inspection/inspection-form'
    );
    vi.mocked(buildInspectionFormProcessFilter).mockResolvedValue({
      processId: 'p1',
    });
    mockTx.inspection_form_templates.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'tpl-by-level2',
        formName: 'Level2 Template',
      });

    const result = await resolveInspectionTemplateBinding(mockTx, {
      workOrderNumber: 'WO-1',
      processName: '焊接',
      materialName: '钢板',
      level2Component: '支架',
    } as any);

    expect(result).toEqual({
      templateId: 'tpl-by-level2',
      templateName: 'Level2 Template',
    });
  });
});
