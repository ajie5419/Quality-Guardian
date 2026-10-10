import type {
  FullResult,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';

import { writeFileSync } from 'node:fs';
import process from 'node:process';

/** Substring markers, case-insensitive, matching the credential-key shape. */
const CREDENTIAL_KEY_MARKERS = [
  'PASSWORD',
  'SECRET',
  'TOKEN',
  'KEY',
  'CREDENTIAL',
];

/** Report outcomes without serializing requests, actions or credential-bearing errors. */
export default class SafeReporter implements Reporter {
  private globalErrors: string[] = [];

  private results: Array<{
    duration: number;
    errors: string[];
    status: string;
    title: string;
  }> = [];

  onEnd(result: FullResult) {
    const report = {
      globalErrors: this.globalErrors,
      status: result.status,
      tests: this.results,
    };
    const directory = process.env.QGS_E2E_ARTIFACT_DIR;
    writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
    writeFileSync(
      `${directory}/report.html`,
      `<html lang="en"><meta charset="utf-8"><title>Web E2E</title><body><h1>${result.status}</h1><pre>${JSON.stringify(report, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre></body></html>`,
    );
  }

  onError(error: TestError) {
    const message = this.safeMessage(error.message || 'Suite failed');
    this.globalErrors.push(message);
    process.stdout.write(`${message}\n`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const errors = result.errors.map((error) =>
      this.safeMessage(error.stack || error.message || 'Test failed'),
    );
    this.results.push({
      title: test.title,
      status: result.status,
      duration: result.duration,
      errors,
    });
    process.stdout.write(`${result.status}: ${test.title}\n`);
    for (const error of errors) process.stdout.write(`${error}\n`);
  }

  private safeMessage(message: string) {
    // Auto-discover credential-shaped env values so newly added secrets
    // (OSS AK, SMS keys, ...) are redacted without touching this list.
    for (const [key, value] of Object.entries(process.env)) {
      const upperKey = key.toUpperCase();
      if (!CREDENTIAL_KEY_MARKERS.some((marker) => upperKey.includes(marker)))
        continue;
      // Short values would over-redact unrelated words in stack traces.
      if (!value || value.length < 8) continue;
      message = message.replaceAll(value, '[REDACTED]');
    }
    return message.replaceAll(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[REDACTED_TOKEN]');
  }
}
