import { nextTick, ref } from 'vue';

import { saveLocalInspectionReceipt } from './components/myInspectionReceipts';

export interface SubmittedInspectionRequestLike {
  partName?: null | string;
  processName?: null | string;
  requestNo: string;
  workOrderNumber?: null | string;
}

/**
 * "My reports" entry tab: records a local receipt after a successful
 * submission (anonymous scans have no identity) and switches to the tab.
 */
export interface MyInspectionReportsInstance {
  reload: () => Promise<void>;
}

export function useMyInspectionReports() {
  const activeEntryTab = ref('form');
  const myReportsRef = ref<MyInspectionReportsInstance>();

  async function switchToMyReports(
    created: SubmittedInspectionRequestLike,
    fallback: {
      partName: string;
      processName: string;
      workOrderNumber: string;
    },
  ) {
    saveLocalInspectionReceipt({
      partName: created.partName || fallback.partName,
      processName: created.processName || fallback.processName,
      requestNo: created.requestNo,
      submittedAt: new Date().toISOString(),
      workOrderNumber: created.workOrderNumber || fallback.workOrderNumber,
    });
    activeEntryTab.value = 'my-reports';
    // The tab content mounts asynchronously; reload after the ref binds.
    await nextTick();
    void myReportsRef.value?.reload();
  }

  return { activeEntryTab, myReportsRef, switchToMyReports };
}
