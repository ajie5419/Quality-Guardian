import type { MenuRecordRaw } from '@vben/types';

import { describe, expect, it } from 'vitest';

import {
  ACCESS_DENIED_PATH,
  findFirstAccessibleMenuPath,
  resolveInitialAccessPath,
} from './accessible-redirect';

const accessiblePaths = new Set(['/qms/dashboard', '/qms/inspection/issues']);
const isRouteAccessible = (path: string) => accessiblePaths.has(path);

const menus: MenuRecordRaw[] = [
  {
    children: [
      {
        name: 'Inspection issues',
        path: '/qms/inspection/issues',
      },
    ],
    name: 'Inspection',
    path: '/qms/inspection',
  },
];

describe('accessible redirect', () => {
  it('keeps the preferred path when its route is accessible', () => {
    expect(
      resolveInitialAccessPath('/qms/dashboard', menus, isRouteAccessible),
    ).toBe('/qms/dashboard');
  });

  it('falls back to the first accessible leaf menu', () => {
    expect(
      resolveInitialAccessPath('/qms/dashboard', menus, (path) =>
        path.endsWith('/issues'),
      ),
    ).toBe('/qms/inspection/issues');
  });

  it('ignores hidden, disabled, and external menu targets', () => {
    const guardedMenus: MenuRecordRaw[] = [
      { name: 'Hidden', path: '/hidden', show: false },
      { disabled: true, name: 'Disabled', path: '/disabled' },
      { name: 'External', path: 'https://example.com' },
      ...menus,
    ];

    expect(findFirstAccessibleMenuPath(guardedMenus, () => true)).toBe(
      '/qms/inspection/issues',
    );
  });

  it('uses the access denied page when no page route is accessible', () => {
    expect(resolveInitialAccessPath('/', [], () => false)).toBe(
      ACCESS_DENIED_PATH,
    );
  });
});
