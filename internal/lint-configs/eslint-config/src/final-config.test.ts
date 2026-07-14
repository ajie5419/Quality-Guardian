import process from 'node:process';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = process.cwd();
const eslint = new ESLint({ cwd: ROOT_DIR });

async function getRule(filePath: string, ruleId: string) {
  const config = await eslint.calculateConfigForFile(filePath);
  expect(config).toBeDefined();
  return config?.rules?.[ruleId];
}

function getRestrictedSyntaxSelectors(rule: unknown): unknown[] {
  expect(Array.isArray(rule)).toBe(true);
  return (rule as unknown[]).slice(1);
}

function getRestrictedImportPatterns(rule: unknown) {
  expect(Array.isArray(rule)).toBe(true);
  const options = (rule as unknown[])[1] as {
    patterns?: Array<{ group?: string[] }>;
  };
  return options.patterns ?? [];
}

describe('final ESLint configuration', () => {
  it('keeps base and audit syntax restrictions in backend modules', async () => {
    const filePath = 'apps/backend/modules/example/example.service.ts';
    const rule = await getRule(filePath, 'no-restricted-syntax');
    const selectors = getRestrictedSyntaxSelectors(rule);

    expect(selectors).toContain('DebuggerStatement');
    expect(selectors).toContain('WithStatement');
    expect(selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: expect.stringContaining("key.name='details'"),
        }),
        expect.objectContaining({
          selector: expect.stringContaining('recordBusinessAuditLog'),
        }),
      ]),
    );

    const results = await eslint.lintText(
      'debugger; recordBusinessAuditLog(event, { details: `raw` });',
      { filePath },
    );
    const restrictedMessages = results[0]?.messages.filter(
      ({ ruleId }) => ruleId === 'no-restricted-syntax',
    );
    expect(restrictedMessages).toHaveLength(3);
  });

  it('keeps all QMS import and syntax restrictions cumulative', async () => {
    const filePath = 'apps/web-antd/src/views/qms/inspection/issues/example.ts';
    const importRule = await getRule(filePath, 'no-restricted-imports');
    const importGroups = getRestrictedImportPatterns(importRule).flatMap(
      ({ group }) => group ?? [],
    );

    expect(importGroups).toEqual(
      expect.arrayContaining([
        '#/api/*',
        '**/constants',
        '#/views/qms/inspection/records/config',
        '#/api/qms/enums',
      ]),
    );

    const syntaxRule = await getRule(filePath, 'no-restricted-syntax');
    const selectors = getRestrictedSyntaxSelectors(syntaxRule);
    expect(selectors).toContain('DebuggerStatement');
    expect(selectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: expect.stringContaining("id.name='STATUS_OPTIONS'"),
        }),
        expect.objectContaining({
          selector: "TSEnumDeclaration[id.name='LossType']",
        }),
        expect.objectContaining({
          selector: expect.stringContaining("id.name='IMPORT_STATUS_MAP'"),
        }),
      ]),
    );
  });

  it('does not leak Vue rules into TypeScript tests', async () => {
    const filePath =
      'apps/web-antd/src/views/qms/inspection/issues/example.test.ts';

    expect(
      await getRule(filePath, 'vue/one-component-per-file'),
    ).toBeUndefined();
    expect(await getRule(filePath, 'n/prefer-global/process')).toEqual([
      0,
      'never',
    ]);
    expect(
      await getRule(filePath, 'node/prefer-global/process'),
    ).toBeUndefined();
  });
});
