import type { RouteRecordRaw } from 'vue-router';

import { IFrameView } from '#/layouts';

/**
 * Builds the "项目履约" external menu entry. The fulfillment system is a
 * separate app, so the entry opens it in a new tab via `meta.link`.
 * Returns no route when the URL is not configured or is not http(s), which
 * hides the entry.
 */
export function buildFulfillmentRoutes(
  url: string | undefined,
): RouteRecordRaw[] {
  const value = url?.trim() ?? '';
  if (!/^https?:\/\/[^\s/]\S*$/i.test(value)) return [];
  return [
    {
      component: IFrameView,
      meta: {
        icon: 'carbon:delivery',
        link: value,
        order: 1900,
        title: '项目履约',
      },
      name: 'FulfillmentLink',
      path: '/fulfillment-link',
    },
  ];
}
