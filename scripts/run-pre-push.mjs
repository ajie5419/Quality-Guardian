import { execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const proseFiles = new Set([
  'AGENTS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'code_map.md',
  'CONSTRAINTS.md',
  'docs/governance-charter.md',
  'docs/PROJECT_GUIDE.md',
  'PROGRESS.md',
  'PROJECT_STATE.md',
  'README.md',
]);

/**
 * Classify Git's actual push updates, not Lefthook's existing-file list:
 * deletions and code-to-doc renames must retain the full checks.
 * New refs, missing history, tags and uncertain inputs fail closed.
 */
export async function isDocsOnlyPush(input, cwd = process.cwd()) {
  const git = async (...args) => {
    const result = await exec('git', args, { cwd, maxBuffer: 8 * 1024 * 1024 });
    return result.stdout;
  };
  const paths = (value) => value.split('\0').filter(Boolean);
  const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
  try {
    if (!input.trim()) return false;
    const headResult = await git('rev-parse', 'HEAD');
    const head = headResult.trim();
    const changed = [];
    for (const line of input.trim().split('\n')) {
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 4) return false;
      const [localRef, localOid, remoteRef, remoteOid] = fields;
      if (
        !localRef.startsWith('refs/heads/') ||
        !remoteRef.startsWith('refs/heads/') ||
        !oid.test(localOid) ||
        !oid.test(remoteOid) ||
        /^0+$/.test(remoteOid) ||
        localOid !== head
      )
        return false;
      await git('merge-base', '--is-ancestor', remoteOid, localOid);
      changed.push(
        ...paths(
          await git(
            'diff',
            '--name-only',
            '-z',
            '--no-renames',
            remoteOid,
            localOid,
            '--',
          ),
        ),
      );
    }
    // Existing checks inspect this checkout; uncertain local WIP stays on the full path.
    changed.push(
      ...paths(
        await git('diff', '--name-only', '-z', '--no-renames', 'HEAD', '--'),
      ),
      ...paths(await git('ls-files', '--others', '--exclude-standard', '-z')),
    );
    return changed.length > 0 && changed.every((file) => proseFiles.has(file));
  } catch {
    return false;
  }
}

export async function runChecks(input) {
  const docsOnly = await isDocsOnlyPush(input);
  const checks = docsOnly
    ? ['check:docs-drift']
    : ['check:type', 'check:qms-arch', 'check:docs-drift'];
  console.log(
    `[pre-push] ${docsOnly ? 'prose-only' : 'full'}: ${checks.join(', ')}`,
  );
  const results = await Promise.all(
    checks.map(
      (check) =>
        new Promise((resolveResult) => {
          const child = spawn('pnpm', ['run', check], { stdio: 'inherit' });
          child.on('error', (error) => {
            console.error(`[pre-push] ${check}: ${error.message}`);
            resolveResult(1);
          });
          child.on('exit', (code) => resolveResult(code ?? 1));
        }),
    ),
  );
  return results.some((code) => code !== 0) ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const input = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
  process.exitCode = await runChecks(input);
}
