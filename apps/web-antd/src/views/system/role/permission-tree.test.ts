import type { RolePermissionTreeNode } from './permission-tree';

import { describe, expect, it } from 'vitest';

import {
  addRequiredPagePermissions,
  reconcileRolePermissionSelection,
} from './permission-tree';

const tree: RolePermissionTreeNode[] = [
  {
    checkable: false,
    key: 'MENU_qms',
    type: 'catalog',
    children: [
      {
        key: 'QMS:Inspection:Issues:List',
        type: 'menu',
        children: [
          { key: 'QMS:Inspection:Issues:View', type: 'button' },
          { key: 'QMS:Inspection:Issues:Edit', type: 'button' },
        ],
      },
    ],
  },
];

describe('reconcileRolePermissionSelection', () => {
  it('normalizes existing child-only permissions before editing', () => {
    expect(
      addRequiredPagePermissions(tree, [
        'MENU_qms',
        'QMS:Inspection:Issues:View',
      ]),
    ).toEqual(['QMS:Inspection:Issues:View', 'QMS:Inspection:Issues:List']);
  });

  it('drops permissions that are no longer declared in the tree', () => {
    expect(
      addRequiredPagePermissions(tree, [
        'Unknown:Permission',
        'QMS:Inspection:Issues:List',
      ]),
    ).toEqual(['QMS:Inspection:Issues:List']);
  });

  it('adds the owning page when a button is selected', () => {
    expect(
      reconcileRolePermissionSelection({
        changedKey: 'QMS:Inspection:Issues:View',
        checked: true,
        checkedKeys: ['QMS:Inspection:Issues:View'],
        tree,
      }),
    ).toEqual(['QMS:Inspection:Issues:View', 'QMS:Inspection:Issues:List']);
  });

  it('does not grant sibling buttons when a page is selected', () => {
    expect(
      reconcileRolePermissionSelection({
        changedKey: 'QMS:Inspection:Issues:List',
        checked: true,
        checkedKeys: ['QMS:Inspection:Issues:List'],
        tree,
      }),
    ).toEqual(['QMS:Inspection:Issues:List']);
  });

  it('removes descendant buttons when a page is cleared', () => {
    expect(
      reconcileRolePermissionSelection({
        changedKey: 'QMS:Inspection:Issues:List',
        checked: false,
        checkedKeys: [
          'QMS:Inspection:Issues:View',
          'QMS:Inspection:Issues:Edit',
        ],
        tree,
      }),
    ).toEqual([]);
  });

  it('keeps the page when one button is cleared', () => {
    expect(
      reconcileRolePermissionSelection({
        changedKey: 'QMS:Inspection:Issues:View',
        checked: false,
        checkedKeys: [
          'QMS:Inspection:Issues:List',
          'QMS:Inspection:Issues:Edit',
        ],
        tree,
      }),
    ).toEqual(['QMS:Inspection:Issues:List', 'QMS:Inspection:Issues:Edit']);
  });

  it('never submits synthetic catalog keys', () => {
    expect(
      reconcileRolePermissionSelection({
        changedKey: 'MENU_qms',
        checked: true,
        checkedKeys: ['MENU_qms'],
        tree,
      }),
    ).toEqual([]);
  });
});
