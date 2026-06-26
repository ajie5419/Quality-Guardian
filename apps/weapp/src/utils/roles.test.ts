import { describe, expect, it } from 'vitest';

import { canDispatchByRoles } from './roles';

describe('canDispatchByRoles', () => {
  it('detects display role names returned by wx login', () => {
    expect(canDispatchByRoles(['Super Admin'])).toBe(true);
  });

  it('detects normalized role codes', () => {
    expect(canDispatchByRoles(['super_admin'])).toBe(true);
    expect(canDispatchByRoles(['dispatch-manager'])).toBe(true);
  });

  it('does not grant dispatch access for inspector roles', () => {
    expect(canDispatchByRoles(['检验员', 'operator'])).toBe(false);
  });
});
