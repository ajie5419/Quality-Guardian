import { describe, expect, it, vi } from 'vitest';

const reconcilePassRateIdentity = vi.fn().mockResolvedValue({ runId: 'run-1' });

vi.mock('./reconcile-pass-rate-identity', () => ({
  reconcilePassRateIdentity,
}));

describe('pass-rate reconciliation windows', () => {
  it('persists all required windows with explicit labels', async () => {
    const { reconcilePassRateIdentityWindows } = await import(
      './reconcile-pass-rate-identity-windows'
    );
    await reconcilePassRateIdentityWindows(
      ['--apply'],
      new Date('2026-08-01T12:00:00.000Z'),
    );

    expect(reconcilePassRateIdentity).toHaveBeenCalledTimes(6);
    expect(reconcilePassRateIdentity).toHaveBeenCalledWith(
      expect.arrayContaining(['--label=CURRENT_MONTH']),
    );
    expect(reconcilePassRateIdentity).toHaveBeenCalledWith(
      expect.arrayContaining(['--label=HISTORICAL_BACKFILL']),
    );
    expect(reconcilePassRateIdentity).toHaveBeenCalledWith(
      expect.arrayContaining(['--label=NO_DATA_FUTURE']),
    );
  });
});
