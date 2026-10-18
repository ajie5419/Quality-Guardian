import { describe, expect, it, vi } from 'vitest';

import { buildFulfillmentRoutes } from './fulfillment-link';

vi.mock('#/layouts', () => ({ IFrameView: {} }));

describe('buildFulfillmentRoutes', () => {
  it('hides the entry when the URL is missing, blank or invalid', () => {
    expect(buildFulfillmentRoutes(undefined)).toEqual([]);
    expect(buildFulfillmentRoutes('  ')).toEqual([]);
    expect(buildFulfillmentRoutes('not a url')).toEqual([]);
    expect(buildFulfillmentRoutes('javascript:alert(1)')).toEqual([]);
    expect(buildFulfillmentRoutes('ftp://fulfillment.example.test')).toEqual(
      [],
    );
    expect(buildFulfillmentRoutes('https://%')).toEqual([]);
  });

  it('adds one external menu entry that opens the configured URL', () => {
    const [route, ...rest] = buildFulfillmentRoutes(
      ' https://fulfillment.example.test ',
    );
    expect(rest).toEqual([]);
    expect(route?.meta).toMatchObject({
      link: 'https://fulfillment.example.test/',
      title: '项目履约',
    });
  });
});
