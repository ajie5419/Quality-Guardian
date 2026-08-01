import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  generateIdentityBaseline,
  isDirectExecution,
  runIdentityBaselineCli,
} from './master-data-identity-baseline';

function createClient() {
  return {
    $queryRawUnsafe: async <T>(query: string, ...params: unknown[]) => {
      if (query.includes('information_schema.KEY_COLUMN_USAGE')) {
        return [{ columnName: 'id' }] as T;
      }
      const cursor = String(params[0] || '');
      if (cursor) return [] as T;
      return [
        {
          entityId: 'record-2',
          isDeleted: '0',
          rawId: 'canonical-2',
          rawName: 'Snapshot B',
        },
        {
          entityId: 'record-1',
          isDeleted: false,
          rawId: null,
          rawName: 'Snapshot A',
        },
      ] as T;
    },
  };
}

describe('master data identity baseline', () => {
  it('creates a deterministic, paged, read-only identity baseline', async () => {
    const first = await generateIdentityBaseline({
      client: createClient(),
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
      pageSize: 2,
    });
    const second = await generateIdentityBaseline({
      client: createClient(),
      generatedAt: new Date('2026-08-01T01:00:00.000Z'),
      pageSize: 2,
    });

    expect(first.contentChecksum).toBe(second.contentChecksum);
    expect(first.generatedAt).not.toBe(second.generatedAt);
    expect(first.fields.every((field) => field.records === 2)).toBe(true);
    expect(first.fields.every((field) => field.missingId === 1)).toBe(true);
    expect(first.fields.every((field) => field.withId === 1)).toBe(true);
  });

  it('runs the CLI when tsx provides the script path relative to the working directory', () => {
    expect(
      isDirectExecution(
        'scripts/master-data-identity-baseline.ts',
        'file:///workspace/apps/backend/scripts/master-data-identity-baseline.ts',
        '/workspace/apps/backend',
      ),
    ).toBe(true);
  });

  it('writes the requested baseline file through the CLI entry point', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'qgs-identity-baseline-'));
    const output = join(directory, 'baseline.json');
    try {
      const baseline = await runIdentityBaselineCli(
        [`--output=${output}`, '--page-size=2'],
        {
          client: createClient(),
          generatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      );
      const persisted = JSON.parse(await readFile(output, 'utf8')) as {
        contentChecksum: string;
        pageSize: number;
      };

      expect(persisted.contentChecksum).toBe(baseline.contentChecksum);
      expect(persisted.pageSize).toBe(2);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
