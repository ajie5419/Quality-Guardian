import { randomBytes } from 'node:crypto';

import { expect, it } from 'vitest';

import { assertOwnedResource, assertTarget, ownerLabel } from './safety.mjs';

function target() {
  const id = randomBytes(12).toString('hex');
  const secret = randomBytes(32).toString('hex');
  return {
    QGS_E2E_MODE: 'isolated',
    NODE_ENV: 'test',
    QGS_E2E_RUN_ID: id,
    QGS_E2E_OWNER: id,
    DATABASE_URL: `mysql://qgs_${id}:${secret}@127.0.0.1:45001/qgs_e2e_${id}`,
    REDIS_URL: `redis://default:${secret}@127.0.0.1:45002/0`,
    QGS_E2E_MYSQL_CONTAINER: `qgs-e2e-${id}-mysql`,
    QGS_E2E_MYSQL_PORT: '45001',
    QGS_E2E_REDIS_CONTAINER: `qgs-e2e-${id}-redis`,
    QGS_E2E_REDIS_PORT: '45002',
  };
}

it('accepts an explicit owned loopback target', () => {
  expect(() => assertTarget(target())).not.toThrow();
});

for (const [description, change] of [
  [
    'missing test mode',
    (env) => {
      delete env.QGS_E2E_MODE;
    },
  ],
  [
    'production mode',
    (env) => {
      env.NODE_ENV = 'production';
    },
  ],
  [
    'foreign owner',
    (env) => {
      env.QGS_E2E_OWNER = randomBytes(12).toString('hex');
    },
  ],
  [
    'shared database despite a test suffix',
    (env) => {
      env.DATABASE_URL = env.DATABASE_URL.replace(
        /qgs_e2e_[a-f\d]+$/,
        'shared_test',
      );
    },
  ],
  [
    'remote MySQL host',
    (env) => {
      env.DATABASE_URL = env.DATABASE_URL.replace(
        '127.0.0.1',
        'db.example.com',
      );
    },
  ],
  [
    'remote Redis host',
    (env) => {
      env.REDIS_URL = env.REDIS_URL.replace('127.0.0.1', 'redis.example.com');
    },
  ],
  [
    'shared port',
    (env) => {
      env.DATABASE_URL = env.DATABASE_URL.replace('45001', '3306');
    },
  ],
  [
    'shared account',
    (env) => {
      env.DATABASE_URL = env.DATABASE_URL.replace(/qgs_[a-f\d]+:/, 'root:');
    },
  ],
  [
    'unowned published port',
    (env) => {
      env.QGS_E2E_MYSQL_PORT = '45003';
    },
  ],
  [
    'foreign container',
    (env) => {
      env.QGS_E2E_MYSQL_CONTAINER = 'shared-mysql';
    },
  ],
]) {
  it(`rejects ${description}`, () => {
    const env = target();
    change(env);
    expect(() => assertTarget(env)).toThrow();
  });
}

function resource(env) {
  return {
    configuration: {
      id: env.QGS_E2E_MYSQL_CONTAINER,
      labels: { [ownerLabel]: env.QGS_E2E_OWNER },
      image: { reference: 'docker.io/library/mysql:8.0' },
      publishedPorts: [
        { hostAddress: '127.0.0.1', hostPort: 45_001, containerPort: 3306 },
      ],
    },
  };
}

it('accepts a live owned MySQL resource with a matching dedicated port', () => {
  const env = target();
  expect(() => assertOwnedResource(env, 'mysql', resource(env))).not.toThrow();
});

for (const [description, change] of [
  [
    'label mismatch',
    (row) => {
      row.configuration.labels[ownerLabel] = 'foreign';
    },
  ],
  [
    'image mismatch',
    (row) => {
      row.configuration.image.reference = 'foreign-mysql:8.0';
    },
  ],
  [
    'public bind',
    (row) => {
      row.configuration.publishedPorts[0].hostAddress = '0.0.0.0';
    },
  ],
  [
    'missing port',
    (row) => {
      row.configuration.publishedPorts = [];
    },
  ],
]) {
  it(`rejects a live resource with ${description}`, () => {
    const env = target();
    const row = resource(env);
    change(row);
    expect(() => assertOwnedResource(env, 'mysql', row)).toThrow();
  });
}
