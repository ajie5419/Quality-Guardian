const RELOAD_STORAGE_KEY = 'qgs:chunk-load-reload-at';
const RELOAD_WINDOW_MS = 30_000;

function isChunkLoadError(error: unknown) {
  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  return /error loading dynamically imported module|failed to fetch dynamically imported module|loading chunk \d+ failed|importing a module script failed/i.test(
    message,
  );
}

function reloadOnceForFreshAssets() {
  const now = Date.now();
  const lastReloadAt = Number(
    window.sessionStorage.getItem(RELOAD_STORAGE_KEY) || 0,
  );

  if (Number.isFinite(lastReloadAt) && now - lastReloadAt < RELOAD_WINDOW_MS) {
    return;
  }

  window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
  window.location.reload();
}

function setupChunkLoadRecovery() {
  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) {
      return;
    }

    event.preventDefault();
    reloadOnceForFreshAssets();
  });
}

export { isChunkLoadError, reloadOnceForFreshAssets, setupChunkLoadRecovery };
