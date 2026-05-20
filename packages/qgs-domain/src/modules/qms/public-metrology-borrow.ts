import { env } from 'node:process';

export const PUBLIC_METROLOGY_BORROW_OPERATOR = 'PUBLIC_QR';

export function readPublicMetrologyBorrowExpectedToken(): string {
  return String(env.METROLOGY_PUBLIC_BORROW_TOKEN || '').trim();
}

export function resolvePublicMetrologyBorrowToken(params: {
  headerToken?: unknown;
  payloadToken?: unknown;
}): string {
  return (
    String(params.payloadToken || '').trim() ||
    String(params.headerToken || '').trim()
  );
}

export function verifyPublicMetrologyBorrowToken(params: {
  expectedToken?: unknown;
  headerToken?: unknown;
  payloadToken?: unknown;
}): boolean {
  const expectedToken = String(params.expectedToken || '').trim();
  if (!expectedToken) {
    return true;
  }

  const token = resolvePublicMetrologyBorrowToken({
    headerToken: params.headerToken,
    payloadToken: params.payloadToken,
  });
  return token === expectedToken;
}
