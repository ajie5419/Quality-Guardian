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

async function getRuleSeverity(filePath: string, ruleId: string) {
  const rule = await getRule(filePath, ruleId);
  expect(Array.isArray(rule)).toBe(true);
  return (rule as unknown[])[0];
}

describe('final ESLint configuration', () => {
  it('keeps base and audit syntax restrictions in backend modules', async () => {
    const filePath = 'apps/backend/modules/dashboard/dashboard.service.ts';
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

    expect(
      await getRule(
        'packages/@core/base/shared/src/utils/inference.ts',
        'vue/prefer-import-from-vue',
      ),
    ).toEqual([2]);
  });

  it('enforces backend source safety without blocking test fixtures', async () => {
    const sourceFile = 'apps/backend/modules/dashboard/dashboard.service.ts';
    const testFile = 'apps/backend/utils/event-bus.test.ts';
    const sourceConfig = await eslint.calculateConfigForFile(sourceFile);

    expect(sourceConfig?.languageOptions?.parserOptions).toEqual(
      expect.objectContaining({
        projectService: true,
      }),
    );
    expect(
      sourceConfig?.languageOptions?.parserOptions?.project,
    ).toBeUndefined();

    for (const ruleId of [
      '@typescript-eslint/await-thenable',
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/no-misused-promises',
      '@typescript-eslint/no-non-null-assertion',
      '@typescript-eslint/only-throw-error',
      '@typescript-eslint/return-await',
      '@typescript-eslint/switch-exhaustiveness-check',
      '@typescript-eslint/use-unknown-in-catch-callback-variable',
      'no-console',
      'no-empty',
    ]) {
      expect(await getRuleSeverity(sourceFile, ruleId)).toBe(2);
    }

    expect(
      await getRule(sourceFile, '@typescript-eslint/return-await'),
    ).toEqual([2, 'error-handling-correctness-only']);

    const typedResults = await eslint.lintText('Promise.resolve();', {
      filePath: sourceFile,
    });
    expect(typedResults[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: '@typescript-eslint/no-floating-promises',
        }),
      ]),
    );

    expect(
      await getRuleSeverity(sourceFile, '@typescript-eslint/no-explicit-any'),
    ).toBe(0);
    expect(
      await getRuleSeverity(testFile, '@typescript-eslint/no-explicit-any'),
    ).toBe(0);
    expect(
      await getRuleSeverity(
        testFile,
        '@typescript-eslint/no-non-null-assertion',
      ),
    ).toBe(0);
    expect(await getRuleSeverity(testFile, 'no-console')).toBe(0);
    const testConfig = await eslint.calculateConfigForFile(testFile);
    expect(
      testConfig?.languageOptions?.parserOptions?.projectService,
    ).toBeUndefined();
    for (const ruleId of [
      '@typescript-eslint/await-thenable',
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/no-misused-promises',
      '@typescript-eslint/only-throw-error',
      '@typescript-eslint/return-await',
      '@typescript-eslint/switch-exhaustiveness-check',
      '@typescript-eslint/use-unknown-in-catch-callback-variable',
    ]) {
      expect(await getRule(testFile, ruleId)).toBeUndefined();
    }
    expect(await getRuleSeverity(sourceFile, 'no-throw-literal')).toBe(0);
    expect(
      await getRuleSeverity(
        sourceFile,
        '@typescript-eslint/no-require-imports',
      ),
    ).toBe(2);

    for (const ruleId of [
      'test/expect-expect',
      'test/no-disabled-tests',
      'test/no-duplicate-hooks',
      'test/valid-describe-callback',
      'test/valid-expect',
    ]) {
      expect(await getRuleSeverity(testFile, ruleId)).toBe(2);
    }
  });
});
