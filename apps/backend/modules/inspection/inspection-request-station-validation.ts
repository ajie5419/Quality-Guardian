import { ErrorCode } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';

/**
 * Writes must reject invalid selections before the tolerant historical reader
 * normalizes them. Never clamp a submitted station into a different machine.
 */
export function assertInspectionRequestStationSelection(
  value: unknown,
  bound: number,
  required: boolean,
): void {
  const reject = (message: string): never => {
    throw new BusinessError(ErrorCode.VALIDATION, message, 400);
  };
  if (value === undefined || value === null) {
    if (required) reject('请选择报检台数');
    return;
  }
  if (!Number.isSafeInteger(bound) || bound < 1) {
    reject('station selection requires a work order with at least one machine');
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    reject('台数选择格式无效');
  }
  const selection = value as Record<string, unknown>;
  if (selection.mode !== 'ALL' && selection.mode !== 'PARTIAL') {
    reject('台数选择模式必须为 ALL 或 PARTIAL');
  }
  if (selection.mode === 'ALL') {
    if (
      selection.indexes !== undefined &&
      (!Array.isArray(selection.indexes) || selection.indexes.length > 0)
    ) {
      reject('全部台数不能同时指定部分台号');
    }
    return;
  }
  if (!Array.isArray(selection.indexes) || selection.indexes.length === 0) {
    reject('部分台数至少选择一个台号');
  }
  for (const index of selection.indexes as unknown[]) {
    if (
      (typeof index !== 'number' && typeof index !== 'string') ||
      (typeof index === 'string' && !/^\d+$/.test(index.trim())) ||
      !Number.isSafeInteger(Number(index)) ||
      Number(index) < 1 ||
      Number(index) > bound
    ) {
      reject(`台号必须为 1 至 ${bound} 的整数`);
    }
  }
}
