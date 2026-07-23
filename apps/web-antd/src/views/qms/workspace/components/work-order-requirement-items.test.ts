import { describe, expect, it } from 'vitest';

import {
  formatWorkOrderRequirementItems,
  resolveWorkOrderRequirementItems,
} from './work-order-requirement-items';

describe('work order requirement items', () => {
  it('preserves structured items when the editor text is unchanged', () => {
    const originalItems = [{ key: 'appearance' }, 'Check dimensions'];
    const originalText = formatWorkOrderRequirementItems(originalItems);

    expect(
      resolveWorkOrderRequirementItems({
        currentText: originalText,
        originalItems,
        originalText,
      }),
    ).toEqual(originalItems);
  });

  it('uses edited lines when the user changes the item text', () => {
    expect(
      resolveWorkOrderRequirementItems({
        currentText: 'Check paint\n\nCheck labels ',
        originalItems: [{ key: 'appearance' }],
        originalText: '{"key":"appearance"}',
      }),
    ).toEqual(['Check paint', 'Check labels']);
  });
});
