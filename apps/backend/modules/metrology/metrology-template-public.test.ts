import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMetrologyTemplateRows } from '~/modules/metrology/metrology-template';

const getHeader = vi.fn();
const forbiddenResponse = vi.fn((_event, message: string) => ({
  code: 403,
  message,
}));
const readPublicMetrologyBorrowExpectedToken = vi.fn();
const verifyPublicMetrologyBorrowToken = vi.fn();

vi.mock('h3', () => ({
  getHeader,
}));

vi.mock('~/utils/response', () => ({
  forbiddenResponse,
}));

vi.mock('@qgs/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@qgs/shared')>()),
  PUBLIC_METROLOGY_BORROW_OPERATOR: 'public-metrology-borrow',
  readPublicMetrologyBorrowExpectedToken,
  verifyPublicMetrologyBorrowToken,
}));

describe('metrology template and public borrow helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns metrology import template rows', () => {
    expect(getMetrologyTemplateRows()).toEqual([
      {
        序号: 1,
        量具名称: '游标卡尺',
        编号: 'JL-001',
        型号: '0-150mm',
        使用单位: '结构BU1',
        有效期: '2026-12-31',
        检验状态: '在检',
      },
    ]);
  });

  it('allows public borrow access when no expected token is configured', async () => {
    readPublicMetrologyBorrowExpectedToken.mockReturnValue('');
    const { verifyPublicMetrologyBorrowAccess } = await import(
      '~/modules/metrology/public-metrology-borrow'
    );

    expect(verifyPublicMetrologyBorrowAccess({} as any)).toBe(true);
    expect(verifyPublicMetrologyBorrowToken).not.toHaveBeenCalled();
  });

  it('allows public borrow access when header or payload token verifies', async () => {
    readPublicMetrologyBorrowExpectedToken.mockReturnValue('expected-token');
    getHeader.mockReturnValue('header-token');
    verifyPublicMetrologyBorrowToken.mockReturnValue(true);
    const { verifyPublicMetrologyBorrowAccess } = await import(
      '~/modules/metrology/public-metrology-borrow'
    );

    expect(verifyPublicMetrologyBorrowAccess({} as any, 'payload-token')).toBe(
      true,
    );
    expect(verifyPublicMetrologyBorrowToken).toHaveBeenCalledWith({
      expectedToken: 'expected-token',
      headerToken: 'header-token',
      payloadToken: 'payload-token',
    });
  });

  it('returns forbidden response when public borrow token is invalid', async () => {
    readPublicMetrologyBorrowExpectedToken.mockReturnValue('expected-token');
    getHeader.mockReturnValue('bad-token');
    verifyPublicMetrologyBorrowToken.mockReturnValue(false);
    const { verifyPublicMetrologyBorrowAccess } = await import(
      '~/modules/metrology/public-metrology-borrow'
    );
    const event = {} as any;

    expect(verifyPublicMetrologyBorrowAccess(event)).toEqual({
      code: 403,
      message: '扫码借用入口无效或已过期',
    });
    expect(forbiddenResponse).toHaveBeenCalledWith(
      event,
      '扫码借用入口无效或已过期',
    );
  });
});
