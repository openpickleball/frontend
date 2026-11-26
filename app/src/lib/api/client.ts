import createClient, { type Client } from 'openapi-fetch';
import { CSRF_BOOTSTRAP_PATH, createCsrfMiddleware, readCsrfToken } from './csrf';
import { isAbortError, networkError, timeoutError } from './errors';
import type { paths as OpenPaths } from './generated/open';
import type { paths as AllauthPaths } from './generated/allauth';

/**
 * The generated paths already carry their prefix (`/api/v1/...` and
 * `/_allauth/{client}/v1/...`), so both clients use an empty base URL. Same-origin
 * only: the session cookie and CSRF need it (dev proxy in vite.config.ts).
 */
export type CreateApiOptions = {
	baseUrl?: string;
	fetch?: typeof fetch;
	/** Where to read cookies from. Defaults to `document.cookie`. */
	getCookies?: () => string;
	/**
	 * How long to wait for an answer, in milliseconds, before giving up with a `network` error
	 * (code `timeout`). Defaults to `REQUEST_TIMEOUT_MS`.
	 */
	timeoutMs?: number;
};

/** Long enough for a slow phone connection, short enough that a screen never waits forever. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** allauth paths have a `{client}` segment. The web app always uses `browser`. */
export const ALLAUTH_CLIENT = 'browser' as const;
/** Pass as `params` on every allauth call: `allauth.GET(path, { params: allauthParams })`. */
export const allauthParams = { path: { client: ALLAUTH_CLIENT } } as const;

export type Api = {
	/** The first-party API, `/api/v1`. */
	open: Client<OpenPaths>;
	/** allauth headless, `/_allauth/browser/v1`. Pass `allauthParams`. */
	allauth: Client<AllauthPaths>;
	/** Make sure the CSRF cookie exists. Call once at startup. */
	initCsrf: () => Promise<void>;
	/**
	 * Call `listener` whenever `open` answers 401: the session ended while the app was open.
	 * allauth's 401s are left out, because there they are session state, not a failure.
	 * Returns a function that stops listening.
	 */
	onUnauthenticated: (listener: () => void) => () => void;
};

export function createApi(options: CreateApiOptions = {}): Api {
	const baseUrl = options.baseUrl ?? '';
	const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
	// fetch rejects only when no answer came, or when the request was aborted. Mark the first as
	// a network error here, so a later failure (such as a 200 that is not JSON) can't pass for one.
	// A request with no answer after `timeoutMs` is aborted and is a network error too, so the
	// screen can offer to try again. An abort the caller asked for stays an abort.
	const doFetch: typeof fetch = async (input, init) => {
		const controller = new AbortController();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort(new DOMException('The request timed out.', 'TimeoutError'));
		}, timeoutMs);
		const callerSignals = [input instanceof Request ? input.signal : null, init?.signal ?? null];
		const stop = () => controller.abort(callerSignals.find((s) => s?.aborted)?.reason);
		for (const signal of callerSignals) {
			if (signal?.aborted) stop();
			signal?.addEventListener('abort', stop, { once: true });
		}
		try {
			return await (options.fetch ?? globalThis.fetch)(input, {
				...init,
				signal: controller.signal
			});
		} catch (cause) {
			if (timedOut) throw timeoutError(cause);
			throw isAbortError(cause) ? cause : networkError(cause);
		} finally {
			clearTimeout(timer);
			for (const signal of callerSignals) signal?.removeEventListener('abort', stop);
		}
	};
	const getCookies =
		options.getCookies ?? (() => (typeof document === 'undefined' ? '' : document.cookie));

	const getToken = () => readCsrfToken(getCookies());
	const refresh = async () => {
		try {
			await doFetch(`${baseUrl}${CSRF_BOOTSTRAP_PATH}`, { credentials: 'same-origin' });
		} catch {
			// The request that needed the token will report the network failure.
		}
	};

	const csrf = createCsrfMiddleware({ getToken, refresh });
	const open = createClient<OpenPaths>({ baseUrl, fetch: doFetch });
	const allauth = createClient<AllauthPaths>({ baseUrl, fetch: doFetch });
	open.use(csrf);
	allauth.use(csrf);

	const listeners = new Set<() => void>();
	open.use({
		onResponse({ response }) {
			if (response.status !== 401) return;
			for (const listener of listeners) listener();
		}
	});
	function onUnauthenticated(listener: () => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	return {
		open,
		allauth,
		initCsrf: async () => (getToken() ? undefined : refresh()),
		onUnauthenticated
	};
}
