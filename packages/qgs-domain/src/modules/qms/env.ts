/**
 * Read Node.js env value safely without triggering browser-injected `process` getters.
 */
export function readRuntimeEnv(name: string): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'process');
  if (!descriptor || !('value' in descriptor)) {
    return undefined;
  }
  const value = (
    descriptor.value as { env?: Record<string, string | undefined> } | undefined
  )?.env?.[name];
  return typeof value === 'string' ? value : undefined;
}
