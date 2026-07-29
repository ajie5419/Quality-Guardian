import { describe, expect, it, vi } from 'vitest';

import { supplierModule } from './supplier.module';

const startSupplierScoreWorker = vi.hoisted(() => vi.fn());

vi.mock('./supplier-score-worker.service', () => ({
  startSupplierScoreWorker,
}));

describe('supplier module declaration', () => {
  it('is side-effect free when release scripts load module metadata', () => {
    expect(supplierModule.name).toBe('supplier');
    expect(startSupplierScoreWorker).not.toHaveBeenCalled();
  });
});
