import type { Ref } from 'vue';

import type { InspectionIssue } from '../types';

import { computed, ref } from 'vue';

import { findNameById } from '#/types';

export function useIssueDetail(deptRawData: Ref<any[]>) {
  const detailVisible = ref(false);
  const detailRecord = ref<InspectionIssue | undefined>(undefined);

  function openDetail(row: InspectionIssue) {
    detailRecord.value = row;
    detailVisible.value = true;
  }

  function parsePhotos(photos: unknown): string[] {
    if (!Array.isArray(photos)) return [];
    const result: string[] = [];
    for (const item of photos) {
      if (typeof item === 'string') {
        result.push(item);
        continue;
      }
      if (
        item &&
        typeof item === 'object' &&
        'url' in item &&
        typeof item.url === 'string'
      ) {
        result.push(item.url);
      }
    }
    return result;
  }

  const detailPhotos = computed(() => parsePhotos(detailRecord.value?.photos));

  function formatDept(value: string | undefined) {
    if (!value) return '-';
    return findNameById(deptRawData.value, value) || value;
  }

  function formatDepartments(record: InspectionIssue) {
    let values: string[] = [];
    if (
      Array.isArray(record.responsibleDepartments) &&
      record.responsibleDepartments.length > 0
    ) {
      values = record.responsibleDepartments;
    } else if (record.responsibleDepartment) {
      values = [record.responsibleDepartment];
    }
    if (values.length === 0) return '-';
    return values.map((value) => formatDept(value)).join(', ');
  }

  function formatDisplayDate(value: string | undefined) {
    if (!value) return '-';
    return value.includes('T') ? value.slice(0, 10) : value;
  }

  return {
    detailVisible,
    detailRecord,
    detailPhotos,
    openDetail,
    formatDept,
    formatDepartments,
    formatDisplayDate,
  };
}
