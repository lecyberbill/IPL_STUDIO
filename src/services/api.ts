/**
 * Thin fetch wrapper for the dev-only server APIs.
 * Attaches the auth token (IPL_DEV_TOKEN) and a JSON content type to every call.
 */
export const DEV_TOKEN: string = typeof __IPL_DEV_TOKEN__ !== 'undefined' ? __IPL_DEV_TOKEN__ : '';

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (DEV_TOKEN) headers.set('X-IPL-Token', DEV_TOKEN);
  return fetch(url, { ...options, headers });
}
