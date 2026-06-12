import { describe, expect, it } from 'vitest';

import { normalizeListResponse, normalizeMutationResponse } from './adapters';

describe('normalizeListResponse', () => {
  it('wraps a raw array into { items, total }', () => {
    const result = normalizeListResponse([{ id: 1 }, { id: 2 }]);
    expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }], total: 2 });
  });

  it('extracts items and total from object payload', () => {
    const result = normalizeListResponse({ items: [1, 2, 3], total: 10 });
    expect(result).toEqual({ items: [1, 2, 3], total: 10 });
  });

  it('returns empty items when payload has no items array', () => {
    const result = normalizeListResponse({ total: 5 });
    expect(result).toEqual({ items: [], total: 5 });
  });

  it('defaults total to items length when total is missing', () => {
    const result = normalizeListResponse({ items: ['a', 'b'] });
    expect(result).toEqual({ items: ['a', 'b'], total: 2 });
  });

  it('handles null/undefined input', () => {
    expect(normalizeListResponse(null)).toEqual({ items: [], total: 0 });
    expect(normalizeListResponse(undefined)).toEqual({ items: [], total: 0 });
  });

  it('handles string total by coercing to number', () => {
    const result = normalizeListResponse({ items: [], total: '7' });
    expect(result.total).toBe(7);
  });
});

describe('normalizeMutationResponse', () => {
  it('preserves response with success field', () => {
    const input = { data: { id: 1 }, message: 'ok', success: true };
    expect(normalizeMutationResponse(input)).toEqual(input);
  });

  it('wraps raw value when no success field', () => {
    const result = normalizeMutationResponse({ id: 42 });
    expect(result).toEqual({ data: { id: 42 }, success: true });
  });

  it('wraps primitive values', () => {
    expect(normalizeMutationResponse('done')).toEqual({
      data: 'done',
      success: true,
    });
  });

  it('handles null input', () => {
    expect(normalizeMutationResponse(null)).toEqual({
      data: null,
      success: true,
    });
  });

  it('coerces falsy success to boolean', () => {
    const result = normalizeMutationResponse({
      data: null,
      success: 0,
    });
    expect(result.success).toBe(false);
  });
});
