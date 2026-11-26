import { createOpenApiHttp } from 'openapi-msw';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, CSRF_HOST_COOKIE_NAME } from '../api/csrf';
import type { paths as AllauthPaths } from '../api/generated/allauth';
import type { paths as OpenPaths } from '../api/generated/open';
import type { paths as ProvisionalPaths } from '../api/provisional';
import type { MockStore } from './store';

/**
 * The app calls its API on its own origin, so a handler would match a relative path in the
 * browser. Node has no origin to resolve it against, so match any origin in both.
 */
const ANY_ORIGIN = '*';

/** MSW's `http`, typed by the generated paths. */
export const openHttp = createOpenApiHttp<OpenPaths>({ baseUrl: ANY_ORIGIN });
export const allauthHttp = createOpenApiHttp<AllauthPaths>({ baseUrl: ANY_ORIGIN });
export const provisionalHttp = createOpenApiHttp<ProvisionalPaths>({ baseUrl: ANY_ORIGIN });

/** The request's JSON body, or undefined when it is missing or not JSON. */
export async function readJson(request: { json(): Promise<unknown> }): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

export function readObject(body: unknown): Record<string, unknown> {
	return typeof body === 'object' && body !== null && !Array.isArray(body)
		? (body as Record<string, unknown>)
		: {};
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Django's CSRF check: an unsafe request needs `X-CSRFToken` equal to the CSRF
 * cookie (`__Host-csrftoken`, else `csrftoken`). In the browser the cookie is `document.cookie`, set by an earlier response.
 * Under Node there is no cookie jar, so the token the store issued stands in for it.
 */
export function csrfValid(
	request: Request,
	cookies: Record<string, string | undefined>,
	store: MockStore
): boolean {
	if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
	const header = request.headers.get(CSRF_HEADER_NAME);
	const expected =
		cookies[CSRF_HOST_COOKIE_NAME] ?? cookies[CSRF_COOKIE_NAME] ?? store.state.csrfToken;
	return Boolean(header) && header === expected;
}
