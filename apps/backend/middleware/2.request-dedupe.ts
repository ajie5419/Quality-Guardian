import type { EventHandlerRequest, H3Event } from 'h3';

import { createHash } from 'node:crypto';

import {
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRequestURL,
  readBody,
} from 'h3';
import { conflictResponse } from '~/utils/response';

const DEDUPE_WINDOW_MS = 3000;
const WRITE_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);
const dedupeTimers = new Map<string, NodeJS.Timeout>();

function sha256(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function normalizeForHash(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => normalizeForHash(item));

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeForHash(item)]);
    return Object.fromEntries(entries);
  }

  return value;
}

function shouldSkipByContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('multipart/form-data') ||
    normalized.includes('application/octet-stream')
  );
}

function resolveRequestIdentity(event: H3Event<EventHandlerRequest>) {
  if (event.context.userId) return `user:${event.context.userId}`;

  const authorization = String(getHeader(event, 'authorization') || '').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) return `token:${sha256(token)}`;
  }

  const ip =
    getRequestIP(event, { xForwardedFor: true }) ||
    getRequestIP(event) ||
    'anonymous';
  return `ip:${ip}`;
}

export default defineEventHandler(async (event) => {
  const method = String(event.method || '').toUpperCase();
  if (!WRITE_METHODS.has(method)) return;

  const pathname = getRequestURL(event).pathname;
  if (!pathname.startsWith('/api/')) return;

  const contentType = String(getHeader(event, 'content-type') || '');
  if (shouldSkipByContentType(contentType)) return;

  let bodyHash = '';
  try {
    const body = await readBody(event);
    bodyHash = sha256(JSON.stringify(normalizeForHash(body)));
  } catch {
    // Keep empty hash when body is unreadable/empty.
    bodyHash = '';
  }

  const dedupeKey = sha256(
    `${resolveRequestIdentity(event)}|${method}|${pathname}|${bodyHash}`,
  );
  if (dedupeTimers.has(dedupeKey)) {
    return conflictResponse(event, '请求重复，请勿重复提交');
  }

  const timer = setTimeout(() => {
    dedupeTimers.delete(dedupeKey);
  }, DEDUPE_WINDOW_MS);
  dedupeTimers.set(dedupeKey, timer);
});
