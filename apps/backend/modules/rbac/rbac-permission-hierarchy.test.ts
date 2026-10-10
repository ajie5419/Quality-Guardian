import { describe, expect, it } from 'vitest';

import {
  applyImpliedPermissionCodes,
  findMissingPagePermissions,
  getPagePermissionRequirements,
} from './rbac-permission-hierarchy';

const menus = [
  {
    authCode: null,
    id: 'catalog',
    parentId: '0',
    type: 'catalog',
  },
  {
    authCode: 'QMS:Inspection:Issues:List',
    id: 'issues',
    parentId: 'catalog',
    type: 'menu',
  },
  {
    authCode: 'QMS:Inspection:Issues:View',
    id: 'issues-view',
    parentId: 'issues',
    type: 'button',
  },
];

describe('findMissingPagePermissions', () => {
  it('builds button-to-page requirements from the menu hierarchy', () => {
    expect(getPagePermissionRequirements(menus)).toEqual([
      {
        pagePermission: 'QMS:Inspection:Issues:List',
        permission: 'QMS:Inspection:Issues:View',
      },
    ]);
  });

  it('requires the owning page permission for a selected button', () => {
    expect(
      findMissingPagePermissions(['QMS:Inspection:Issues:View'], menus),
    ).toEqual([
      {
        pagePermission: 'QMS:Inspection:Issues:List',
        permission: 'QMS:Inspection:Issues:View',
      },
    ]);
  });

  it('accepts a button accompanied by its page permission', () => {
    expect(
      findMissingPagePermissions(
        ['QMS:Inspection:Issues:List', 'QMS:Inspection:Issues:View'],
        menus,
      ),
    ).toEqual([]);
  });

  it('ignores unknown permissions and catalog placeholders', () => {
    expect(
      findMissingPagePermissions(
        ['External:Permission', 'MENU_catalog'],
        menus,
      ),
    ).toEqual([]);
  });

  it('stops safely when menu parents contain a cycle', () => {
    expect(
      findMissingPagePermissions(
        ['QMS:Inspection:Issues:View'],
        [menus[2], { id: 'issues', parentId: 'issues', type: 'catalog' }],
      ),
    ).toEqual([]);
  });
});

describe('applyImpliedPermissionCodes', () => {
  it('grants the inspection dashboard to request list holders', () => {
    expect(
      applyImpliedPermissionCodes(['QMS:Inspection:Requests:List']),
    ).toContain('QMS:Inspection:Dashboard:List');
  });

  it('grants the request list to dispatch and close holders', () => {
    expect(
      applyImpliedPermissionCodes(['QMS:Inspection:Requests:Dispatch']),
    ).toContain('QMS:Inspection:Requests:List');
    expect(
      applyImpliedPermissionCodes(['QMS:Inspection:Requests:Close']),
    ).toContain('QMS:Inspection:Requests:List');
  });

  it('reaches the dashboard through a chained implied code', () => {
    expect(
      applyImpliedPermissionCodes(['QMS:Inspection:Requests:Close']),
    ).toContain('QMS:Inspection:Dashboard:List');
  });

  it('does not invent codes for unrelated permissions', () => {
    expect(applyImpliedPermissionCodes(['QMS:WorkOrder:List'])).not.toContain(
      'QMS:Inspection:Dashboard:List',
    );
  });

  it('keeps already-granted codes without duplication', () => {
    const codes = applyImpliedPermissionCodes([
      'QMS:Inspection:Requests:List',
      'QMS:Inspection:Dashboard:List',
    ]);
    expect(
      codes.filter((code) => code === 'QMS:Inspection:Dashboard:List'),
    ).toHaveLength(1);
  });
});
