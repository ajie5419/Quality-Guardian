import type { Prisma, PrismaClient } from '@prisma/client';

import type { BridgeClient } from './config';
import type { AuthorizeInput, ExchangeInput } from './schema';

import { Buffer } from 'node:buffer';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { createId } from '@paralleldrive/cuid2';

import { digest, rejectIdentity } from './config';

type Database = Prisma.TransactionClient;
const token = () => randomBytes(32).toString('base64url');

async function activeIdentity(db: Database, id: string) {
  const user = await db.users.findFirst({
    where: { id, isDeleted: false, status: 'ACTIVE' },
    select: { id: true, realName: true, username: true },
  });
  if (!user) rejectIdentity();
  return {
    id: user.id,
    name: user.realName || user.username,
    active: true as const,
  };
}

/** MySQL is authoritative across workers; no cache or memory fallback can redeem a code. */
export function createIdentityBridge(
  db: PrismaClient,
  client: BridgeClient,
  now = () => new Date(),
) {
  function registered(clientId: string, redirectUri: string) {
    if (clientId !== client.id || redirectUri !== client.callback)
      rejectIdentity();
  }

  async function authorize(userId: string, input: AuthorizeInput) {
    registered(input.clientId, input.redirectUri);
    await activeIdentity(db, userId);
    const code = token();
    await db.identityBridgeCode.create({
      data: {
        id: createId(),
        hash: digest(code),
        clientId: client.id,
        redirectUri: input.redirectUri,
        challenge: input.challenge,
        userId,
        expiresAt: new Date(now().getTime() + 60_000),
      },
    });
    const callback = new URL(client.callback);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', input.state);
    return { callback: callback.href };
  }

  async function exchange(input: ExchangeInput) {
    registered(client.id, input.redirectUri);
    const challenge = createHash('sha256')
      .update(input.verifier)
      .digest('base64url');
    const credential = token();
    const time = now();
    const expiresAt = new Date(time.getTime() + 3_600_000);
    await db.$transaction(async (tx) => {
      const where = {
        hash: digest(input.code),
        clientId: client.id,
        redirectUri: input.redirectUri,
        challenge,
        consumedAt: null,
        expiresAt: { gt: time },
      };
      const code = await tx.identityBridgeCode.findFirst({ where });
      if (!code) rejectIdentity();
      if (!timingSafeEqual(Buffer.from(code.challenge), Buffer.from(challenge)))
        rejectIdentity();
      await activeIdentity(tx, code.userId);
      // The conditional write is the linearization point; credential creation rolls back with it.
      const consumed = await tx.identityBridgeCode.updateMany({
        where,
        data: { consumedAt: time },
      });
      if (consumed.count !== 1) rejectIdentity();
      await tx.identityBridgeCredential.create({
        data: {
          id: createId(),
          hash: digest(credential),
          clientId: client.id,
          userId: code.userId,
          expiresAt,
        },
      });
    });
    return { credential, expiresAt: expiresAt.toISOString() };
  }

  async function identity(credential: string) {
    if (!/^[\w-]{43}$/.test(credential)) rejectIdentity();
    const record = await db.identityBridgeCredential.findFirst({
      where: {
        hash: digest(credential),
        clientId: client.id,
        revokedAt: null,
        expiresAt: { gt: now() },
      },
    });
    if (!record) rejectIdentity();
    return activeIdentity(db, record.userId);
  }

  async function revoke(credential: string) {
    if (!/^[\w-]{43}$/.test(credential)) rejectIdentity();
    await db.identityBridgeCredential.updateMany({
      where: { hash: digest(credential), clientId: client.id, revokedAt: null },
      data: { revokedAt: now() },
    });
    return { revoked: true as const };
  }
  return { authorize, exchange, identity, revoke };
}
