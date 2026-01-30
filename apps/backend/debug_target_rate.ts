/* eslint-disable no-console */
import { getTargetPassRate } from './constants/quality-standards';

console.log('Testing getTargetPassRate...');
console.log('原材料:', getTargetPassRate('原材料'));
console.log('下料:', getTargetPassRate('下料'));
console.log('Unknown:', getTargetPassRate('未知工序'));
console.log('Null:', getTargetPassRate(undefined));

// 模拟 API 中的逻辑
const mockData = [
  { process: '原材料', category: '来料检验' },
  { process: '下料', category: '过程检验' },
];

const result = mockData.map((item) => ({
  ...item,
  targetPassRate: getTargetPassRate(item.process),
}));

console.log('Mock API Result:', JSON.stringify(result, null, 2));
