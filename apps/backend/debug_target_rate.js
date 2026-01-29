// 模拟 constants/quality-standards.ts 的逻辑
const DEFAULT_DEFECT_TARGET = 0.15;
const PROCESS_DEFECT_TARGETS = {
  '原材料': 0.2,
  '下料': 0.1,
};

const getTargetPassRate = (processName) => {
  if (\!processName) {
    return Number((100 - DEFAULT_DEFECT_TARGET).toFixed(2));
  }
  const defectRate = PROCESS_DEFECT_TARGETS[processName] ?? DEFAULT_DEFECT_TARGET;
  return Number((100 - defectRate).toFixed(2));
};

console.log('Testing getTargetPassRate logic (JS version)...');
console.log('原材料:', getTargetPassRate('原材料'));
console.log('下料:', getTargetPassRate('下料'));
console.log('Unknown:', getTargetPassRate('未知工序'));
console.log('Null:', getTargetPassRate(undefined));
