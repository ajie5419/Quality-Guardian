import type { CAC } from 'cac';

import { mkdirSync } from 'node:fs';

import { execaCommand } from '@vben/node-utils';

interface LintCommandOptions {
  /**
   * Format lint problem.
   */
  format?: boolean;
}

async function runLint({ format }: LintCommandOptions) {
  // process.env.FORCE_COLOR = '3';
  mkdirSync('.lint-cache', { recursive: true });

  if (format) {
    await execaCommand(
      `stylelint "**/*.{vue,css,less,scss}" --cache --cache-location .lint-cache/stylelint --fix`,
      {
        stdio: 'inherit',
      },
    );
    await execaCommand(
      `eslint . --cache --cache-location .lint-cache/eslint --fix`,
      {
        stdio: 'inherit',
      },
    );
    await execaCommand(
      `prettier . --write --cache --cache-location .lint-cache/prettier --log-level warn`,
      {
        stdio: 'inherit',
      },
    );
    return;
  }
  await Promise.all([
    execaCommand(`eslint . --cache --cache-location .lint-cache/eslint`, {
      stdio: 'inherit',
    }),
    execaCommand(
      `prettier . --ignore-unknown --check --cache --cache-location .lint-cache/prettier`,
      {
        stdio: 'inherit',
      },
    ),
    execaCommand(
      `stylelint "**/*.{vue,css,less,scss}" --cache --cache-location .lint-cache/stylelint`,
      {
        stdio: 'inherit',
      },
    ),
  ]);
}

function defineLintCommand(cac: CAC) {
  cac
    .command('lint')
    .usage('Batch execute project lint check.')
    .option('--format', 'Format lint problem.')
    .action(runLint);
}

export { defineLintCommand };
