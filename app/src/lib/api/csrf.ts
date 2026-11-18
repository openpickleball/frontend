import type { Middleware } from 'openapi-fetch';
import { isCsrfFailure } from './errors';

/**
 * Django's CSRF cookie. Keep the name here: backend#102 may add a `__Host-` prefix.
 * Django's defaults (checked in backend `config/settings.py`, which sets neither
 * `CSRF_COOKIE_NAME` nor `CSRF_HEADER_NAME`) are `csrftoken` and `X-CSRFToken`.
 */
export const CSRF_COOKIE_NAME = 'csrftoken';
export const CSRF_HEADER_NAME = 'X-CSRFToken';

/** allauth's `GET config` sets the CSRF cookie (checked against the backend). */
export const CSRF_BOOTSTRAP_PATH = '/_allauth/browser/v1/config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/** Read one cookie from a `document.cookie` style string. */
export function readCookie(cookieString: string, name: string): string | null {
	for (const part of cookieString.split(';')) {
		const index = part.indexOf('=');
		if (index === -1) continue;
		if (part.slice(0, index).trim() === name) {
			const raw = part.slice(index + 1).trim();
			try {
				return decodeURIComponent(raw);
			} catch {
				return raw;
			}
		}
	}
	return null;
}

export type CsrfOptions = {
	/** The current token, or null when there is no cookie yet. */
	getToken: () => string | null;
	/** Ask the backend to set the cookie. Resolves when it has answered. */
	refresh: () => Promise<void>;
};

/**
 * Copy the CSRF cookie into `X-CSRFToken` on unsafe methods. If the cookie is missing,
 * fetch it first. If the backend still answers with a CSRF 403, refresh the token and
 * send the request once more.
 */
export function createCsrfMiddleware({ getToken, refresh }: CsrfOptions): Middleware {
	const originals = new WeakMap<Request, Request>();
	const retried = new WeakSet<Request>();

	function withToken(request: Request, token: string): Request {
		const headers = new Headers(request.headers);
		headers.set(CSRF_HEADER_NAME, token);
		return new Request(request, { headers });
	}

	return {
		async onRequest({ request }) {
			if (SAFE_METHODS.has(request.method.toUpperCase())) return;
			let token = getToken();
			if (!token) {
				await refresh();
				token = getToken();
			}
			const next = token ? withToken(request, token) : request;
			// Keep an unread copy: the body is gone once the request is sent.
			originals.set(next, next.clone());
			return next;
		},
		async onResponse({ request, response, options }) {
			const original = originals.get(request);
			if (!original || retried.has(request) || response.status !== 403) return;
			const text = await response.clone().text();
			let body: unknown = text;
			try {
				body = JSON.parse(text);
			} catch {
				// not JSON: keep the raw text
			}
			if (!isCsrfFailure(403, body)) return;
			retried.add(request);
			await refresh();
			const token = getToken();
			if (!token) return;
			return options.fetch(withToken(original, token));
		}
	};
}
