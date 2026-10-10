import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { assertOwnedTargets, assertTarget, ownerLabel } from './safety.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const web = join(root, 'apps/web-antd');
const backend = join(root, 'apps/backend');
const runId = randomBytes(12).toString('hex');

// Fingerprint roots cover everything an E2E verdict can depend on. Collecting
// recursively beats a hand-maintained list: a new source file can never be
// silently omitted from the evidence, which was the previous failure mode.
const fingerprintRoots = [
  'package.json',
  'pnpm-lock.yaml',
  'turbo.json',
  'vitest.config.ts',
  'apps/backend/api',
  'apps/backend/modules',
  'apps/backend/middleware',
  'apps/backend/plugins',
  'apps/backend/prisma',
  'apps/backend/routes',
  'apps/backend/scripts',
  'apps/backend/utils',
  'apps/backend/error.ts',
  'apps/backend/nitro.config.ts',
  'apps/backend/package.json',
  'apps/web-antd/e2e',
  'apps/web-antd/src',
  'apps/web-antd/package.json',
  'apps/web-antd/playwright.config.ts',
  'apps/web-antd/vite.config.mts',
  'internal/vite-config/src',
  'packages/qgs-shared/dist',
  'packages/qgs-shared/src',
  'scripts/e2e',
];
const fingerprintExcludeDirs = new Set([
  '.git',
  '.nuxt',
  '.output',
  '.turbo',
  'coverage',
  'dist-cache',
  'node_modules',
  'output',
  'playwright-report',
  'test-results',
]);
const fingerprintExtensions = new Set([
  '.cjs',
  '.css',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.prisma',
  '.ts',
  '.vue',
  '.yaml',
  '.yml',
]);

async function collectFingerprintFiles(relativePath, collected) {
  let entry;
  try {
    entry = await stat(join(root, relativePath));
  } catch {
    return;
  }
  if (entry.isDirectory()) {
    const directory = relativePath;
    const [directories, files] = await Promise.all([
      readdir(join(root, directory), { withFileTypes: true }).then((items) =>
        items
          .filter((item) => item.isDirectory())
          .map((item) => `${directory}/${item.name}`),
      ),
      readdir(join(root, directory), { withFileTypes: true }).then((items) =>
        items
          .filter((item) => item.isFile())
          .map((item) => `${directory}/${item.name}`),
      ),
    ]);
    // A nested node_modules under an included root (e.g. a fixture package)
    // must never enter the fingerprint.
    await Promise.all(
      directories
        .filter((name) => !fingerprintExcludeDirs.has(basename(name)))
        .map((name) => collectFingerprintFiles(name, collected)),
    );
    collected.push(...files.filter((name) => keepFingerprintFile(name)));
    return;
  }
  if (keepFingerprintFile(relativePath)) collected.push(relativePath);
}

function keepFingerprintFile(relativePath) {
  const name = basename(relativePath);
  if (name.startsWith('.env')) return false;
  return fingerprintExtensions.has(extname(name));
}

async function collectSourceFiles() {
  const collected = [];
  await Promise.all(
    fingerprintRoots.map((relativePath) =>
      collectFingerprintFiles(relativePath, collected),
    ),
  );
  // Deduplicate (a file can be reachable through two roots) and sort so the
  // evidence is byte-stable across runs and machines.
  return [...new Set(collected)].sort();
}
const scope = process.env.QGS_E2E_SCOPE || 'all';
if (
  ![
    'after-sales',
    'all',
    'inspection',
    'inspection-branches',
    'inspection-management',
    'metrology',
    'metrology-ledger',
    'metrology-risk',
    'quality-loss',
    'quality-loss-lifecycle',
    'quality-loss-risk',
    'supervision',
    'supervision-project',
    'supervision-risk',
    'supplier',
    'supplier-lifecycle',
    'supplier-risk',
    'work-order',
    'work-order-lifecycle',
    'work-order-risk',
  ].includes(scope)
) {
  throw new Error('Unsupported E2E scope');
}
const expectedTests = {
  all: 58,
  inspection: 20,
  'inspection-branches': 12,
  'inspection-management': 4,
  'after-sales': 4,
  metrology: 6,
  'metrology-ledger': 1,
  'metrology-risk': 2,
  supervision: 6,
  'supervision-project': 1,
  'supervision-risk': 2,
  supplier: 8,
  'supplier-lifecycle': 1,
  'supplier-risk': 2,
  'quality-loss': 5,
  'quality-loss-lifecycle': 1,
  'quality-loss-risk': 2,
  'work-order': 5,
  'work-order-lifecycle': 1,
  'work-order-risk': 2,
}[scope];
const startedAt = Date.now();
const artifactDir = join(root, 'output/playwright', runId);
// Shorter than production so "retry after the dedupe window" stays fast while
// remaining far longer than the gap between two clicks of the same submission.
const dedupeWindowMs = Number(process.env.QGS_E2E_DEDUPE_WINDOW_MS || 1500);
const children = [];
const containers = [];
const ports = new Set();
const secrets = Array.from({ length: 8 }, () =>
  randomBytes(32).toString('hex'),
);
const [
  dbPassword,
  rootPassword,
  redisPassword,
  loginPassword,
  wrongPassword,
  accessSecret,
  refreshSecret,
  metrologyToken,
] = secrets;
// Explicit allowlist: ambient DATABASE_URL, Redis, cloud and notification secrets cannot leak in.
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : [],
  ),
);
Object.assign(env, {
  NODE_ENV: 'test',
  QGS_E2E_MODE: 'isolated',
  QGS_E2E_RUN_ID: runId,
  QGS_E2E_OWNER: runId,
  QGS_E2E_ARTIFACT_DIR: artifactDir,
  QGS_E2E_USERNAME: `e2e_${runId}`,
  QGS_E2E_PASSWORD: loginPassword,
  QGS_E2E_WRONG_PASSWORD: wrongPassword,
  QGS_E2E_NEGATIVE_CONTROL:
    process.env.QGS_E2E_NEGATIVE_CONTROL === '1' ? '1' : '0',
  JWT_ACCESS_SECRET: accessSecret,
  JWT_REFRESH_SECRET: refreshSecret,
  METROLOGY_PUBLIC_BORROW_TOKEN: metrologyToken,
  RBAC_READ_V2: 'true',
  DATA_SCOPE_V2: 'true',
  REDIS_OPTIONAL: 'false',
  REDIS_ENABLED: 'true',
  MYSQL_DATABASE: `qgs_e2e_${runId}`,
  MYSQL_USER: `qgs_${runId}`,
  MYSQL_PASSWORD: dbPassword,
  MYSQL_ROOT_PASSWORD: rootPassword,
  REDIS_PASSWORD: redisPassword,
  OSS_PROVIDER: 'local',
  VITE_GLOB_API_URL: '/api',
  VITE_APP_TITLE: 'Quality Guardian E2E',
  VITE_APP_NAMESPACE: `qgs-e2e-${runId}`,
  LOG_LEVEL: 'warn',
  REQUEST_DEDUPE_WINDOW_MS: String(dedupeWindowMs),
  QGS_E2E_DEDUPE_WINDOW_MS: String(dedupeWindowMs),
  PLAYWRIGHT_BROWSERS_PATH: join(root, '.cache/playwright'),
});
let temporary;
let interrupted = false;
let cleanupStarted = false;
const evidence = {
  runId,
  scope,
  startedAt: new Date(startedAt).toISOString(),
  runtime: {},
  stages: [],
  cleanup: [],
  status: 'failed',
  commands: [],
};

function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED]');
  return text.replaceAll(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[REDACTED_TOKEN]');
}

function launch(file, args, cwd = root) {
  const child = spawn(file, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  // Redact the complete buffer, so secrets split across chunks cannot escape.
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const done = new Promise((accept, reject) => {
    child.on('error', () =>
      reject(new Error(`Unable to start ${basename(file)}`)),
    );
    child.on('exit', (code, signal) => {
      evidence.commands.push({ file, args, cwd, pid: child.pid, code, signal });
      accept({ code, signal, output: redact(output) });
    });
  });
  // Register finite commands too: interruptions must not orphan a build or migration.
  const entry = { child, done, file, args, output: () => redact(output) };
  children.push(entry);
  return entry;
}

async function command(file, args, cwd, timeout = 180_000) {
  if (interrupted && !cleanupStarted) throw new Error('Run interrupted');
  const entry = launch(file, args, cwd);
  const timer = setTimeout(() => stop(entry), timeout);
  const killTimer = setTimeout(() => {
    if (entry.child.exitCode === null && entry.child.signalCode === null) {
      process.kill(-entry.child.pid, 'SIGKILL');
    }
  }, timeout + 5000);
  try {
    const result = await entry.done;
    if (result.code !== 0) {
      throw new Error(
        `${basename(file)} failed (${result.code}): ${result.output}`,
      );
    }
    return result.output;
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
  }
}

function stop(entry) {
  if (entry.child.exitCode !== null || entry.child.signalCode !== null) return;
  try {
    process.kill(-entry.child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const port = server.address().port;
  await new Promise((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
  if (port < 10_000) return freePort();
  if (ports.has(port)) return freePort();
  ports.add(port);
  return String(port);
}

async function waitFor(label, probe, maxMs = 90_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error('Run interrupted');
    if (await probe()) return;
    await new Promise((accept) => setTimeout(accept, 500));
  }
  throw new Error(`${label} did not become ready`);
}

async function startContainer(kind, image, args, processArgs = []) {
  const name = `qgs-e2e-${runId}-${kind}`;
  env[`QGS_E2E_${kind.toUpperCase()}_CONTAINER`] = name;
  env[`QGS_E2E_${kind.toUpperCase()}_PORT`] = await freePort();
  const port = env[`QGS_E2E_${kind.toUpperCase()}_PORT`];
  // create then start makes ownership known even when startup fails.
  await command('container', [
    'create',
    '--name',
    name,
    '--label',
    `${ownerLabel}=${runId}`,
    '--publish',
    `127.0.0.1:${port}:${kind === 'mysql' ? 3306 : 6379}`,
    '--memory',
    kind === 'mysql' ? '1G' : '256M',
    ...args,
    image,
    ...processArgs,
  ]);
  containers.push(name);
  await command('container', ['start', name]);
}

async function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  for (const entry of children) stop(entry);
  for (const entry of children) {
    await Promise.race([
      entry.done.catch(() => undefined),
      new Promise((accept) => setTimeout(accept, 5000)),
    ]);
    if (entry.child.exitCode === null && entry.child.signalCode === null) {
      try {
        process.kill(-entry.child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
  for (const name of [...containers].reverse()) {
    // Never delete a matching name whose live owner label belongs to someone else.
    const raw = await command('container', ['inspect', name]);
    const [row] = JSON.parse(raw);
    if (row?.configuration?.labels?.[ownerLabel] !== runId) {
      throw new Error('Cleanup refused: resource ownership changed');
    }
    await command('container', ['stop', name]);
    await command('container', ['delete', name]);
    evidence.cleanup.push({ name, deleted: true });
  }
  if (temporary) {
    await rm(temporary, { recursive: true, force: true });
    evidence.cleanup.push({ temporary: true, deleted: true });
  }
  const remaining = await command('container', ['list', '--all', '--quiet']);
  if (containers.some((name) => remaining.split('\n').includes(name))) {
    throw new Error('Owned container survived cleanup');
  }
  const listening = await Promise.all(
    [...ports].map(
      (port) =>
        new Promise((accept) => {
          const socket = createConnection({
            host: '127.0.0.1',
            port: Number(port),
          });
          socket.setTimeout(1000);
          socket.once('connect', () => {
            socket.destroy();
            accept(port);
          });
          socket.once('error', () => {
            socket.destroy();
            accept(null);
          });
          socket.once('timeout', () => {
            socket.destroy();
            accept(port);
          });
        }),
    ),
  );
  if (listening.some(Boolean))
    throw new Error('Owned port still has a listener');
  for (const entry of children.filter((item) =>
    ['node', 'pnpm'].includes(basename(item.file)),
  )) {
    if (entry.child.exitCode === null && entry.child.signalCode === null) {
      throw new Error('Owned process did not exit');
    }
  }
  evidence.cleanup.push({
    processesExited: true,
    namedVolumesCreated: 0,
    ownedContainersAbsent: true,
    portsClosed: [...ports],
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    interrupted = true;
    for (const entry of children) stop(entry);
  });
}

await mkdir(artifactDir, { recursive: true });
try {
  process.stdout.write(`Web E2E run ${runId}\n`);
  const sourceFiles = await collectSourceFiles();
  evidence.sourceFiles = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(join(root, file)))
          .digest('hex'),
      ]),
    ),
  );
  evidence.sourceSha256 = createHash('sha256')
    .update(JSON.stringify(evidence.sourceFiles))
    .digest('hex');
  const baseCommit = await command('rtk', ['git', 'rev-parse', 'HEAD']);
  evidence.baseCommit = baseCommit.trim();
  evidence.runtime.node = process.version;
  evidence.runtime.platform = `${process.platform}/${process.arch}`;
  const containerVersion = await command('container', ['--version']);
  evidence.runtime.container = containerVersion.trim();
  evidence.resourcesBefore = await command('container', [
    'list',
    '--all',
    '--quiet',
  ]);
  evidence.volumesBefore = await command('container', [
    'volume',
    'list',
    '--quiet',
  ]);
  await command('container', ['list']);
  const require = createRequire(join(root, 'package.json'));
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  const { chromium } = require('playwright');
  evidence.runtime.playwright = require('playwright/package.json').version;
  const browser = await chromium.launch();
  evidence.runtime.chromium = browser.version();
  await browser.close();
  await startContainer('mysql', 'mysql:8.0', [
    '-e',
    'MYSQL_DATABASE',
    '-e',
    'MYSQL_USER',
    '-e',
    'MYSQL_PASSWORD',
    '-e',
    'MYSQL_ROOT_PASSWORD',
  ]);
  // Redis authentication is supplied through inherited environment, never CLI values.
  await startContainer(
    'redis',
    'redis:alpine',
    ['-e', 'REDIS_PASSWORD', '--entrypoint', '/bin/sh'],
    [
      '-c',
      'exec redis-server --requirepass "$REDIS_PASSWORD" --save "" --appendonly no',
    ],
  );
  env.DATABASE_URL = `mysql://${env.MYSQL_USER}:${dbPassword}@127.0.0.1:${env.QGS_E2E_MYSQL_PORT}/${env.MYSQL_DATABASE}`;
  env.REDIS_URL = `redis://default:${redisPassword}@127.0.0.1:${env.QGS_E2E_REDIS_PORT}/0`;
  evidence.targets = {
    mysql: {
      host: '127.0.0.1',
      database: env.MYSQL_DATABASE,
      account: env.MYSQL_USER,
      port: env.QGS_E2E_MYSQL_PORT,
      container: env.QGS_E2E_MYSQL_CONTAINER,
    },
    redis: {
      host: '127.0.0.1',
      port: env.QGS_E2E_REDIS_PORT,
      container: env.QGS_E2E_REDIS_CONTAINER,
    },
  };
  assertTarget(env);
  await assertOwnedTargets(env);
  evidence.runtime.mysql = await command('container', [
    'exec',
    env.QGS_E2E_MYSQL_CONTAINER,
    'mysqld',
    '--version',
  ]);
  evidence.runtime.redis = await command('container', [
    'exec',
    env.QGS_E2E_REDIS_CONTAINER,
    'redis-server',
    '--version',
  ]);
  const backendRequire = createRequire(join(backend, 'package.json'));
  const { PrismaClient } = backendRequire('@prisma/client');
  await waitFor('MySQL', async () => {
    const client = new PrismaClient({
      datasources: { db: { url: env.DATABASE_URL } },
    });
    try {
      const [identity] =
        await client.$queryRaw`SELECT DATABASE() AS databaseName, CURRENT_USER() AS account`;
      return (
        identity.databaseName === env.MYSQL_DATABASE &&
        identity.account.split('@')[0] === env.MYSQL_USER
      );
    } catch {
      return false;
    } finally {
      await client.$disconnect();
    }
  });
  await waitFor('Redis', async () => {
    try {
      env.REDISCLI_AUTH = redisPassword;
      const ping = await command(
        'container',
        [
          'exec',
          '-e',
          'REDISCLI_AUTH',
          env.QGS_E2E_REDIS_CONTAINER,
          'redis-cli',
          'ping',
        ],
        root,
        5000,
      );
      return ping.trim() === 'PONG';
    } catch {
      return false;
    }
  });
  temporary = await mkdtemp(join(tmpdir(), 'qgs-e2e-'));
  const isolatedBackend = join(temporary, 'backend');
  await mkdir(isolatedBackend);
  for (const path of [
    'api',
    'modules',
    'utils',
    'middleware',
    'plugins',
    'routes',
    'error.ts',
    'nitro.config.ts',
    'package.json',
  ]) {
    await cp(join(backend, path), join(isolatedBackend, path), {
      recursive: true,
      filter: (source) =>
        !basename(source).startsWith('.env') && !source.endsWith('.test.ts'),
    });
  }
  await mkdir(join(isolatedBackend, 'prisma'));
  await cp(
    join(backend, 'prisma/schema.prisma'),
    join(isolatedBackend, 'prisma/schema.prisma'),
  );
  await symlink(
    join(backend, 'node_modules'),
    join(isolatedBackend, 'node_modules'),
  );
  env.UPLOAD_DIR = join(temporary, 'uploads');
  env.QGS_E2E_BACKEND_DIR = isolatedBackend;
  // Historical migrations start with ALTER of an existing table, not an empty
  // schema. This generated, test-only baseline is not migration replay evidence.
  const schema = join(isolatedBackend, 'prisma/schema.prisma');
  const baseline = await command(
    'node',
    [
      backendRequire.resolve('prisma/build/index.js'),
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema-datamodel',
      schema,
      '--script',
    ],
    temporary,
  );
  const migrationDir = join(
    isolatedBackend,
    'prisma/migrations/00000000000000_e2e_schema_baseline',
  );
  await mkdir(migrationDir, { recursive: true });
  await writeFile(join(migrationDir, 'migration.sql'), baseline);
  evidence.schemaSha256 = createHash('sha256')
    .update(await readFile(schema))
    .digest('hex');
  await assertOwnedTargets(env);
  evidence.stages.push({
    name: 'migration',
    output: await command(
      'node',
      [
        backendRequire.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        schema,
      ],
      temporary,
    ),
  });
  await assertOwnedTargets(env);
  const tsxCli = backendRequire.resolve('tsx/cli');
  if (process.env.QGS_E2E_FAULT === 'seed') {
    delete env.QGS_E2E_USERNAME;
  }
  await command(
    'node',
    [tsxCli, join(backend, 'scripts/e2e-seed.ts')],
    temporary,
  );
  evidence.stages.push({
    name: 'seed',
    status: 'passed',
    fixture: JSON.parse(await readFile(join(artifactDir, 'seed.json'), 'utf8')),
  });
  const build = await command(
    'node',
    [join(root, 'scripts/e2e/backend-build.mjs')],
    temporary,
  );
  await writeFile(join(artifactDir, 'backend-build.log'), build);
  const apiPort = await freePort();
  const webPort = await freePort();
  Object.assign(env, {
    NITRO_HOST: '127.0.0.1',
    NITRO_PORT: apiPort,
    QGS_E2E_BACKEND_ORIGIN: `http://127.0.0.1:${apiPort}`,
    QGS_E2E_BASE_URL: `http://127.0.0.1:${webPort}`,
  });
  const api = launch(
    'node',
    [join(isolatedBackend, '.output/server/index.mjs')],
    isolatedBackend,
  );
  api.logName = 'api.log';
  const viteCli = join(
    dirname(require.resolve('vite/package.json')),
    'bin/vite.js',
  );
  const front = launch(
    'node',
    [viteCli, '--mode', 'e2e', '--port', webPort],
    web,
  );
  front.logName = 'web.log';
  await waitFor('API', async () => {
    if (api.child.exitCode !== null)
      throw new Error(`API exited: ${api.output()}`);
    try {
      const result = await fetch(
        `${env.QGS_E2E_BACKEND_ORIGIN}/api/auth/departments`,
        { signal: AbortSignal.timeout(5000) },
      );
      return result.ok;
    } catch {
      return false;
    }
  });
  await waitFor('Web', async () => {
    if (front.child.exitCode !== null)
      throw new Error(`Web exited: ${front.output()}`);
    try {
      const result = await fetch(env.QGS_E2E_BASE_URL, {
        signal: AbortSignal.timeout(5000),
      });
      return result.ok;
    } catch {
      return false;
    }
  });
  evidence.stages.push({
    name: 'readiness',
    status: 'passed',
    apiPort,
    webPort,
  });
  const playwrightCli = join(
    dirname(require.resolve('@playwright/test/package.json')),
    'cli.js',
  );
  const suite = launch(
    'node',
    [
      playwrightCli,
      'test',
      '--config',
      'playwright.config.ts',
      ...{
        all: [],
        'after-sales': ['after-sales.spec.ts'],
        metrology: ['metrology.spec.ts'],
        supervision: ['supervision.spec.ts'],
        supplier: ['supplier.spec.ts'],
        'supplier-lifecycle': [
          'supplier.spec.ts',
          '--grep',
          'supplier UI admission lifecycle',
        ],
        'supplier-risk': [
          'supplier.spec.ts',
          '--grep',
          'supplier role and department|outsourcing-only',
        ],
        'quality-loss': ['quality-loss.spec.ts'],
        'quality-loss-lifecycle': [
          'quality-loss.spec.ts',
          '--grep',
          'quality-loss UI entry lifecycle',
        ],
        'quality-loss-risk': [
          'quality-loss.spec.ts',
          '--grep',
          'quality-loss role and department|quality-loss state transition',
        ],
        'work-order': ['work-order.spec.ts'],
        'work-order-lifecycle': [
          'work-order.spec.ts',
          '--grep',
          'work-order UI registration',
        ],
        'work-order-risk': [
          'work-order.spec.ts',
          '--grep',
          'work-order reader and foreign|work-order duplicate',
        ],
        'supervision-project': [
          'supervision.spec.ts',
          '--grep',
          'supervision project UI registration',
        ],
        'supervision-risk': [
          'supervision.spec.ts',
          '--grep',
          'supervision creator scope|supervision committed response',
        ],
        'metrology-ledger': [
          'metrology.spec.ts',
          '--grep',
          'metrology ledger UI',
        ],
        'metrology-risk': [
          'metrology.spec.ts',
          '--grep',
          'custodian confirmation|calibration UI plan',
        ],
        inspection: ['auth-and-request.spec.ts', 'business-chain.spec.ts'],
        'inspection-branches': [
          '--grep',
          'outsourcing|free material|multiple incoming|station|anonymous|manual incoming',
        ],
        'inspection-management': ['inspection-management.spec.ts'],
      }[scope],
    ],
    web,
  );
  suite.logName = 'playwright.log';
  const result = await suite.done;
  process.stdout.write(result.output);
  const report = JSON.parse(
    await readFile(join(artifactDir, 'report.json'), 'utf8'),
  );
  evidence.suiteExitCode = result.code;
  evidence.testCounts = {
    passed: report.tests.filter((item) => item.status === 'passed').length,
    failed: report.tests.filter((item) =>
      ['failed', 'interrupted', 'timedOut'].includes(item.status),
    ).length,
    skipped: report.tests.filter((item) => item.status === 'skipped').length,
    total: report.tests.length,
  };
  if (
    result.code !== 0 ||
    report.status !== 'passed' ||
    report.tests.length !== expectedTests ||
    report.tests.some((item) => item.status !== 'passed')
  ) {
    throw new Error(
      `Web E2E failed or did not execute the complete ${expectedTests}-case ${scope} scope`,
    );
  }
  evidence.status = 'passed';
} catch (error) {
  evidence.error = redact(error.message);
  process.stderr.write(`${evidence.error}\n`);
  process.exitCode = 1;
} finally {
  for (const [index, entry] of children.entries()) {
    if (basename(entry.file) === 'node') {
      await writeFile(
        join(artifactDir, entry.logName || `process-${index}.log`),
        entry.output(),
      );
    }
  }
  try {
    await cleanup();
    evidence.resourcesAfter = await command('container', [
      'list',
      '--all',
      '--quiet',
    ]);
    evidence.volumesAfter = await command('container', [
      'volume',
      'list',
      '--quiet',
    ]);
  } catch (error) {
    evidence.cleanupError = redact(error.message);
    process.stderr.write(`Cleanup failed: ${evidence.cleanupError}\n`);
    evidence.status = 'failed';
    process.exitCode = 1;
  }
  evidence.finishedAt = new Date().toISOString();
  evidence.durationMs = Date.now() - startedAt;
  await writeFile(
    join(artifactDir, 'run.json'),
    JSON.stringify(evidence, null, 2),
  );
  // Cover framework-generated text artifacts as well as our own logs. Never
  // retain credential-bearing input snapshots or bearer tokens after a failure.
  async function sanitize(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) await sanitize(path);
      else if (/\.(?:html|json|log|md|txt)$/.test(item.name)) {
        const original = await readFile(path, 'utf8');
        const safe = redact(original);
        if (safe !== original) await writeFile(path, safe);
      }
    }
  }
  await sanitize(artifactDir);
  process.stdout.write(`Evidence: ${artifactDir}\n`);
}
