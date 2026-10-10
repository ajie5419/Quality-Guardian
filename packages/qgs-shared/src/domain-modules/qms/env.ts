/**
 * Read Node.js env value safely without triggering browser-injected `process` getters.
 */
export function readRuntimeEnv(name: string): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'process');
  if (!descriptor) {
    return undefined;
  }
  // Node 22 exposes process through an accessor. Only invoke it in a Node
  // global; browser-injected process getters must remain untouched.
  let runtime: unknown;
  if ('value' in descriptor) {
    runtime = descriptor.value;
  } else if (
    Object.getOwnPropertyDescriptor(globalThis, 'global')?.value ===
      globalThis &&
    !Object.getOwnPropertyDescriptor(globalThis, 'window')
  ) {
    runtime = descriptor.get?.call(globalThis);
  }
  const value = (
    runtime as undefined | { env?: Record<string, string | undefined> }
  )?.env?.[name];
  return typeof value === 'string' ? value : undefined;
}
