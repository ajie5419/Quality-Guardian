export const inspectionRequestCheckResultOptions = [
  { label: '合格', value: 'PASS' as const },
  { label: '不合格', value: 'FAIL' as const },
];

export const inspectionRequestViewOptions = [
  { label: '待派单', value: 'pending' },
  { label: '待检验', value: 'dispatched' },
  { label: '已完成单', value: 'closed' },
  { label: '不合格异常单', value: 'abnormal' },
  { label: '我的检验', value: 'my-inspection' },
];

/** Views that require the dispatch permission (management scope). */
export const DISPATCH_ONLY_REQUEST_VIEWS = ['pending', 'dispatched'] as const;
