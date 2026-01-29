export const getSegmentedOptions = (t: (key: string) => string) => [
  { label: t('qms.inspection.records.tab.incoming'), value: 'incoming' },
  { label: t('qms.inspection.records.tab.process'), value: 'process' },
  { label: t('qms.inspection.records.tab.shipment'), value: 'shipment' },
];

export const getProcessOptions = (t: (key: string) => string) => [
  {
    label: t('qms.inspection.records.options.process.outsourced'),
    value: '外购件',
  },
  {
    label: t('qms.inspection.records.options.process.rawMaterial'),
    value: '原材料',
  },
  {
    label: t('qms.inspection.records.options.process.auxiliary'),
    value: '辅材',
  },
  {
    label: t('qms.inspection.records.options.process.machined'),
    value: '机加成品件',
  },
  { label: t('qms.inspection.records.options.process.cutting'), value: '下料' },
  {
    label: t('qms.inspection.records.options.process.assembly'),
    value: '组对',
  },
  { label: t('qms.inspection.records.options.process.welding'), value: '焊接' },
  {
    label: t('qms.inspection.records.options.process.weldSize'),
    value: '焊后尺寸',
  },
  {
    label: t('qms.inspection.records.options.process.appearance'),
    value: '外观',
  },
  {
    label: t('qms.inspection.records.options.process.overallAssembly'),
    value: '整体拼装',
  },
  {
    label: t('qms.inspection.records.options.process.assembling'),
    value: '组装',
  },
  {
    label: t('qms.inspection.records.options.process.mounting'),
    value: '装配',
  },
  {
    label: t('qms.inspection.records.options.process.grouping'),
    value: '组拼',
  },
  {
    label: t('qms.inspection.records.options.process.sandblasting'),
    value: '打砂',
  },
  {
    label: t('qms.inspection.records.options.process.painting'),
    value: '喷漆',
  },
];
