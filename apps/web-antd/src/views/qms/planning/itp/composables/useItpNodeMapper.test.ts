import { describe, expect, it } from 'vitest';

import {
  getCurrentProjectVersion,
  getNodeString,
  toItpTreeNode,
  toPlanningNode,
} from './useItpNodeMapper';

describe('getNodeString', () => {
  it('returns empty string when node is undefined', () => {
    expect(getNodeString(undefined, 'name')).toBe('');
  });

  it('returns the string value for a valid key', () => {
    const node = { id: '1', name: 'Test', type: 'item' as const };
    expect(getNodeString(node, 'name')).toBe('Test');
  });

  it('returns empty string when value is not a string', () => {
    const node = { id: '1', name: 123, type: 'item' as const } as any;
    expect(getNodeString(node, 'name')).toBe('');
  });

  it('returns empty string for missing key', () => {
    const node = { id: '1', name: 'Test', type: 'item' as const };
    expect(getNodeString(node, 'missing')).toBe('');
  });
});

describe('toPlanningNode', () => {
  it('returns default node when input is not ItpNodeLike', () => {
    expect(toPlanningNode(null)).toEqual({ id: '', name: '', type: 'item' });
    expect(toPlanningNode(undefined)).toEqual({
      id: '',
      name: '',
      type: 'item',
    });
    expect(toPlanningNode('string')).toEqual({
      id: '',
      name: '',
      type: 'item',
    });
    expect(toPlanningNode(42)).toEqual({ id: '', name: '', type: 'item' });
  });

  it('returns default node when missing required fields', () => {
    expect(toPlanningNode({ id: '1' })).toEqual({
      id: '',
      name: '',
      type: 'item',
    });
    expect(toPlanningNode({ name: 'x' })).toEqual({
      id: '',
      name: '',
      type: 'item',
    });
  });

  it('returns default node when type is invalid', () => {
    expect(toPlanningNode({ id: '1', name: 'x', type: 'invalid' })).toEqual({
      id: '',
      name: '',
      type: 'item',
    });
  });

  it('maps a valid item node', () => {
    const result = toPlanningNode({ id: '1', name: 'Test', type: 'item' });
    expect(result).toEqual({
      id: '1',
      name: 'Test',
      parentId: null,
      status: undefined,
      type: 'item',
      version: undefined,
      workOrderNumber: '',
    });
  });

  it('maps a valid project node with optional fields', () => {
    const result = toPlanningNode({
      id: '2',
      name: 'Proj',
      type: 'project',
      parentId: 'p1',
      status: 'active',
      version: 'v2.0',
      workOrderNumber: 'WO-123',
    });
    expect(result).toEqual({
      id: '2',
      name: 'Proj',
      parentId: 'p1',
      status: 'active',
      type: 'project',
      version: 'v2.0',
      workOrderNumber: 'WO-123',
    });
  });

  it('sets parentId to null when parentId is not a string', () => {
    const result = toPlanningNode({
      id: '1',
      name: 'X',
      type: 'item',
      parentId: 123,
    } as any);
    expect(result.parentId).toBeNull();
  });
});

describe('toItpTreeNode', () => {
  it('returns default node for invalid input', () => {
    expect(toItpTreeNode(null)).toEqual({ id: '', name: '', type: 'item' });
    expect(toItpTreeNode({})).toEqual({ id: '', name: '', type: 'item' });
  });

  it('returns the node itself when it is ItpNodeLike', () => {
    const node = { id: '1', name: 'A', type: 'item' as const };
    expect(toItpTreeNode(node)).toBe(node);
  });
});

describe('getCurrentProjectVersion', () => {
  it('returns v1.0 when project is null', () => {
    expect(getCurrentProjectVersion(null)).toBe('v1.0');
  });

  it('returns v1.0 when project has no version', () => {
    expect(getCurrentProjectVersion({ id: '1', name: 'X', type: 'item' })).toBe(
      'v1.0',
    );
  });

  it('returns the version when project has one', () => {
    expect(
      getCurrentProjectVersion({
        id: '1',
        name: 'X',
        type: 'item',
        version: 'v3.1',
      }),
    ).toBe('v3.1');
  });

  it('returns v1.0 for empty string version', () => {
    expect(
      getCurrentProjectVersion({
        id: '1',
        name: 'X',
        type: 'item',
        version: '',
      }),
    ).toBe('v1.0');
  });
});
