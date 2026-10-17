/** Only the fixed integration page can bypass normal menu initialization after login. */
export function identityRedirect(value: unknown): null | string {
  if (typeof value !== 'string') return null;
  try {
    const decoded = decodeURIComponent(value);
    const url = new URL(decoded, 'https://qms.invalid');
    if (
      url.origin !== 'https://qms.invalid' ||
      url.pathname !== '/identity/authorize' ||
      url.hash
    )
      return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
