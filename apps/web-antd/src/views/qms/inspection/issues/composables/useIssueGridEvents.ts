import type { Ref } from 'vue';

import type { InspectionIssue } from '../types';

import type { VxeCheckboxChangeParams } from '#/types';

export function useIssueGridEvents(params: {
  checkedRows: Ref<InspectionIssue[]>;
  onOpenDetail: (row: InspectionIssue) => void;
}) {
  const { checkedRows, onOpenDetail } = params;

  function onCheckChange(raw: VxeCheckboxChangeParams) {
    const records = raw.$grid.getCheckboxRecords() || [];
    checkedRows.value = records as unknown as InspectionIssue[];
  }

  function onCellClick(raw: {
    column?: { field?: string; type?: string };
    row: InspectionIssue;
  }) {
    if (!raw?.row) return;
    if (raw.column?.type === 'checkbox') return;
    if (!raw.column?.field) return;
    onOpenDetail(raw.row);
  }

  return { onCheckChange, onCellClick };
}
