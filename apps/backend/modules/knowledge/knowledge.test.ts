import { describe, expect, it } from 'vitest';

import {
  buildKnowledgeCreateData,
  buildKnowledgeUpdateData,
} from './knowledge';

describe('knowledge payload utils', () => {
  it('builds create data with defaults and normalized arrays', () => {
    const data = buildKnowledgeCreateData(
      {
        attachments: [{ name: 'a.txt' }],
        content: 'body',
        summary: 'sum',
        tags: ['a', 'b'],
        title: 'title',
      },
      'CAT-1',
      { username: 'tom' },
    );

    expect(data.categoryId).toBe('CAT-1');
    expect(data.author).toBe('tom');
    expect(data.tags).toBe('a,b');
    expect(data.attachment).toContain('a.txt');
    expect(String(data.docId).startsWith('KB-')).toBe(true);
    expect(data.publishDate).toBeInstanceOf(Date);
    expect(data.status).toBe('Published');
    expect(data.version).toBe('V1.0');
  });

  it('builds update data with normalized tags and attachments', () => {
    const data = buildKnowledgeUpdateData({
      attachments: [{ url: '/x' }],
      categoryId: 'CAT-2',
      content: 'c2',
      status: 'Draft',
      summary: 's2',
      tags: ['x', 'y'],
      title: 't2',
      version: 'V2.0',
    });

    expect(data.categoryId).toBe('CAT-2');
    expect(data.tags).toBe('x,y');
    expect(data.attachment).toContain('/x');
    expect(data.updatedAt).toBeInstanceOf(Date);
  });
});
