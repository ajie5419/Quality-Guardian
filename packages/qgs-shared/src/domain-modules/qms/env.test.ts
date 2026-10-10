// @vitest-environment node

import process from 'node:process';

import { afterEach, expect, it, vi } from 'vitest';

import { readRuntimeEnv } from './env';

afterEach(() => vi.unstubAllGlobals());

it('reads an explicitly supplied flag from the real Node runtime', () => {
  const previous = process.env.QGS_ENV_TEST_FLAG;
  process.env.QGS_ENV_TEST_FLAG = 'enabled';
  try {
    expect(readRuntimeEnv('QGS_ENV_TEST_FLAG')).toBe('enabled');
  } finally {
    if (previous === undefined) delete process.env.QGS_ENV_TEST_FLAG;
    else process.env.QGS_ENV_TEST_FLAG = previous;
  }
});

it('does not invoke a browser process accessor', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'process');
  const get = vi.fn(() => {
    throw new Error('Browser getter invoked');
  });
  vi.stubGlobal('window', {});
  Object.defineProperty(globalThis, 'process', { configurable: true, get });
  try {
    expect(readRuntimeEnv('DATA_SCOPE_V2')).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  } finally {
    if (original) Object.defineProperty(globalThis, 'process', original);
  }
});
