export const IDENTITY_AUTHORIZE_PATH = '/identity/authorize';

/** Query key the client may send to force a fresh QMS login (account switch). */
export const IDENTITY_PROMPT_KEY = 'prompt';

function parseAuthorizeUrl(value: unknown): null | URL {
  if (typeof value !== 'string') return null;
  try {
    const decoded = decodeURIComponent(value);
    const url = new URL(decoded, 'https://qms.invalid');
    if (
      url.origin !== 'https://qms.invalid' ||
      url.pathname !== IDENTITY_AUTHORIZE_PATH ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Only the fixed integration page can bypass normal menu initialization after
 * login. The `prompt` flag is always dropped so returning from the login page
 * can never trigger another forced logout.
 */
export function identityRedirect(value: unknown): null | string {
  const url = parseAuthorizeUrl(value);
  if (!url) return null;
  url.searchParams.delete(IDENTITY_PROMPT_KEY);
  return `${url.pathname}${url.search}`;
}

/**
 * Reads the client id and callback a bridge login is heading to. They are only
 * used to look up the trusted display name, never as a navigation target.
 */
export function identityRedirectTarget(
  value: unknown,
): null | { clientId: string; redirectUri: string } {
  const url = parseAuthorizeUrl(value);
  const clientId = url?.searchParams.get('clientId');
  const redirectUri = url?.searchParams.get('redirectUri');
  return clientId && redirectUri ? { clientId, redirectUri } : null;
}
