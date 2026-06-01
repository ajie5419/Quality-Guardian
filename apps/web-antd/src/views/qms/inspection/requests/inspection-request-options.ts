export const inspectionRequestCheckResultOptions = [
  { label: '合格', value: 'PASS' as const },
  { label: '不合格', value: 'FAIL' as const },
];

export const inspectionRequestViewOptions = [
  { label: '当前任务', value: 'current' },
  { label: '待派单', value: 'submitted' },
  { label: '已派单', value: 'dispatched' },
  { label: '我的检验', value: 'inspecting' },
  { label: '进货检验任务', value: 'incoming' },
];
