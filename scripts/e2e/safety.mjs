import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const ownerLabel = 'qgs.e2e.owner';

/** Names alone are not ownership evidence: verify live labels, ports and image. */
export function assertTarget(env) {
  const runId = env.QGS_E2E_RUN_ID;
  if (
    env.QGS_E2E_MODE !== 'isolated' ||
    env.NODE_ENV !== 'test' ||
    !/^[a-f\d]{24}$/.test(runId || '') ||
    env.QGS_E2E_OWNER !== runId
  ) {
    throw new Error('Missing isolated test mode or run ownership');
  }
  const db = new URL(env.DATABASE_URL);
  const redis = new URL(env.REDIS_URL);
  if (
    db.protocol !== 'mysql:' ||
    redis.protocol !== 'redis:' ||
    db.hostname !== '127.0.0.1' ||
    redis.hostname !== '127.0.0.1' ||
    Number(db.port) < 10_000 ||
    Number(redis.port) < 10_000 ||
    db.port === redis.port ||
    db.pathname !== `/qgs_e2e_${runId}` ||
    db.username !== `qgs_${runId}` ||
    db.password.length < 32 ||
    redis.password.length < 32 ||
    redis.username !== 'default' ||
    redis.pathname !== '/0' ||
    db.search ||
    redis.search ||
    db.hash ||
    redis.hash
  ) {
    throw new Error('Refusing non-owned database or Redis target');
  }
  for (const [kind, url] of [
    ['mysql', db],
    ['redis', redis],
  ]) {
    if (
      env[`QGS_E2E_${kind.toUpperCase()}_CONTAINER`] !==
      `qgs-e2e-${runId}-${kind}`
    ) {
      throw new Error('Container name is not owned by this run');
    }
    if (env[`QGS_E2E_${kind.toUpperCase()}_PORT`] !== url.port) {
      throw new Error('Dedicated published port does not match target');
    }
  }
  return { db, redis, runId };
}

export function assertOwnedResource(env, kind, row) {
  assertTarget(env);
  const name = env[`QGS_E2E_${kind.toUpperCase()}_CONTAINER`];
  const config = row?.configuration;
  const port = Number(env[`QGS_E2E_${kind.toUpperCase()}_PORT`]);
  const expectedImage = kind === 'mysql' ? 'mysql:8.0' : 'redis:alpine';
  if (
    config?.id !== name ||
    config?.labels?.[ownerLabel] !== env.QGS_E2E_OWNER ||
    ![`docker.io/library/${expectedImage}`, expectedImage].includes(
      config?.image?.reference,
    ) ||
    !config?.publishedPorts?.some(
      (item) =>
        item.hostAddress === '127.0.0.1' &&
        item.hostPort === port &&
        item.containerPort === (kind === 'mysql' ? 3306 : 6379),
    )
  ) {
    throw new Error(`Live ${kind} resource ownership check failed`);
  }
  return row;
}

export async function inspectOwned(env, kind) {
  assertTarget(env);
  const name = env[`QGS_E2E_${kind.toUpperCase()}_CONTAINER`];
  const { stdout } = await execute('container', ['inspect', name], {
    env,
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  });
  const [row] = JSON.parse(stdout);
  return assertOwnedResource(env, kind, row);
}

/** Run this immediately before every migration or seed, including direct calls. */
export async function assertOwnedTargets(env) {
  await inspectOwned(env, 'mysql');
  await inspectOwned(env, 'redis');
}
