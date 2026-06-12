import { ref } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { useQualityLossGrid } from './useQualityLossGrid';

vi.mock('#/types', () => ({
  findNameById: (data: any[], id: string) => {
    for (const item of data) {
      if (item.id === id) return item.name;
    }
    return '';
  },
}));

function createParams(overrides: Record<string, any> = {}) {
  return {
    canDelete: ref(false),
    canEdit: ref(false),
    canExport: ref(false),
    deptRawData: ref([
      { id: 'd1', name: '质量部' },
      { id: 'd2', name: '生产部' },
    ]),
    exportQualityLossAsXlsx: vi.fn(),
    getQualityLossList: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    handleClaim: vi.fn(),
    handleDelete: vi.fn(),
    handleEdit: vi.fn(),
    qualityLossStatusOptions: ref([
      { label: '待处理', value: 'PENDING', color: 'orange' },
      { label: '已完成', value: 'DONE', color: 'green' },
    ]),
    refreshOverview: vi.fn().mockResolvedValue(undefined),
    t: (key: string) => key,
    ...overrides,
  };
}

describe('useQualityLossGrid', () => {
  describe('getStatusConfig', () => {
    it('returns matching status option', () => {
      const { getStatusConfig } = useQualityLossGrid(createParams());
      const config = getStatusConfig('PENDING');
      expect(config).toEqual({
        label: '待处理',
        value: 'PENDING',
        color: 'orange',
      });
    });

    it('returns default when status not found', () => {
      const { getStatusConfig } = useQualityLossGrid(createParams());
      const config = getStatusConfig('UNKNOWN');
      expect(config).toEqual({ label: 'UNKNOWN', color: 'default' });
    });
  });

  describe('formSchema', () => {
    it('contains three form fields', () => {
      const { formSchema } = useQualityLossGrid(createParams());
      expect(formSchema.value).toHaveLength(3);
    });

    it('uses correct field names', () => {
      const { formSchema } = useQualityLossGrid(createParams());
      const fieldNames = formSchema.value.map((f: any) => f.fieldName);
      expect(fieldNames).toEqual(['workOrderNumber', 'lossSource', 'status']);
    });
  });

  describe('gridOptions', () => {
    it('disables export when canExport is false', () => {
      const { gridOptions } = useQualityLossGrid(createParams());
      expect(gridOptions.value.toolbarConfig?.export).toBe(false);
    });

    it('enables export when canExport is true', () => {
      const { gridOptions } = useQualityLossGrid(
        createParams({ canExport: ref(true) }),
      );
      expect(gridOptions.value.toolbarConfig?.export).toBe(true);
    });

    it('includes claim, edit, delete action options', () => {
      const { gridOptions } = useQualityLossGrid(
        createParams({ canEdit: ref(true), canDelete: ref(true) }),
      );
      const actionCol = gridOptions.value.columns?.at(-1);
      const options = (actionCol as any).cellRender.props.options;
      const codes = options.map((o: any) => o.code || o);
      expect(codes).toContain('claim');
      expect(codes).toContain('edit');
      expect(codes).toContain('delete');
    });

    it('only includes claim when edit and delete disabled', () => {
      const { gridOptions } = useQualityLossGrid(createParams());
      const actionCol = gridOptions.value.columns?.at(-1);
      const options = (actionCol as any).cellRender.props.options;
      const codes = options.map((o: any) => o.code || o);
      expect(codes).toEqual(['claim']);
    });

    it('formats amount with yen symbol', () => {
      const { gridOptions } = useQualityLossGrid(createParams());
      const amountCol = gridOptions.value.columns?.find(
        (c: any) => c.field === 'amount',
      );
      const result = (amountCol as any).formatter({ cellValue: 12_345 });
      expect(result).toBe('¥12,345');
    });

    it('formats actualClaim with yen symbol', () => {
      const { gridOptions } = useQualityLossGrid(createParams());
      const col = gridOptions.value.columns?.find(
        (c: any) => c.field === 'actualClaim',
      );
      const result = (col as any).formatter({ cellValue: 9800 });
      expect(result).toBe('¥9,800');
    });

    it('formats actualClaim with zero when null', () => {
      const { gridOptions } = useQualityLossGrid(createParams());
      const col = gridOptions.value.columns?.find(
        (c: any) => c.field === 'actualClaim',
      );
      const result = (col as any).formatter({ cellValue: null });
      expect(result).toBe('¥0');
    });

    it('formats responsibleDepartment via findNameById', () => {
      const { gridOptions } = useQualityLossGrid(createParams());
      const col = gridOptions.value.columns?.find(
        (c: any) => c.field === 'responsibleDepartment',
      );
      expect((col as any).formatter({ cellValue: 'd1' })).toBe('质量部');
      expect((col as any).formatter({ cellValue: 'd2' })).toBe('生产部');
    });

    it('returns empty string for null responsibleDepartment', () => {
      const { gridOptions } = useQualityLossGrid(createParams());
      const col = gridOptions.value.columns?.find(
        (c: any) => c.field === 'responsibleDepartment',
      );
      expect((col as any).formatter({ cellValue: null })).toBe('');
    });
  });
});
