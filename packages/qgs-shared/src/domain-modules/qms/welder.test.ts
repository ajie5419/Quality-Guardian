import { describe, expect, it } from 'vitest';

import { buildWelderCreateDataCore, buildWelderUpdateDataCore } from './welder';

describe('buildWelderCreateDataCore', () => {
  it('emits the canonical weldingMethod key', () => {
    const data = buildWelderCreateDataCore({
      name: 'Alice',
      team: 'Assembly Team',
      welderCode: 'W-001',
      weldingMethod: 'SMAW',
    });

    expect(data).toMatchObject({
      name: 'Alice',
      team: 'Assembly Team',
      welderCode: 'W-001',
      weldingMethod: 'SMAW',
    });
    expect(data).not.toHaveProperty('welding_method');
  });

  it('defaults weldingMethod to null when it is absent', () => {
    const data = buildWelderCreateDataCore({
      name: 'Alice',
      team: 'Assembly Team',
    });

    expect(data).toMatchObject({ weldingMethod: null });
  });

  it('normalizes the legacy welding_method key at the boundary', () => {
    const data = buildWelderCreateDataCore({
      name: 'Alice',
      team: 'Assembly Team',
      welding_method: '  GTAW ',
    });

    expect(data).toMatchObject({ weldingMethod: 'GTAW' });
    expect(data).not.toHaveProperty('welding_method');
  });
});

describe('buildWelderUpdateDataCore', () => {
  it('emits the canonical weldingMethod key', () => {
    const data = buildWelderUpdateDataCore({ weldingMethod: 'FCAW' });

    expect(data).toMatchObject({ weldingMethod: 'FCAW' });
    expect(data).not.toHaveProperty('welding_method');
  });

  it('leaves weldingMethod untouched when it is not provided', () => {
    const data = buildWelderUpdateDataCore({ name: 'Alice' });

    expect(data).not.toHaveProperty('weldingMethod');
  });

  it('clears weldingMethod when an empty value is provided', () => {
    expect(buildWelderUpdateDataCore({ weldingMethod: '' })).toMatchObject({
      weldingMethod: null,
    });
  });

  it('normalizes the legacy welding_method key at the boundary', () => {
    const data = buildWelderUpdateDataCore({ welding_method: 'GTAW' });

    expect(data).toMatchObject({ weldingMethod: 'GTAW' });
    expect(data).not.toHaveProperty('welding_method');
  });
});
