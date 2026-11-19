import createClient, { type Client } from 'openapi-fetch';
import { CSRF_BOOTSTRAP_PATH, CSRF_COOKIE_NAME, createCsrfMiddleware, readCookie } from './csrf';
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
};

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
	const doFetch: typeof fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init);
	const getCookies =
		options.getCookies ?? (() => (typeof document === 'undefined' ? '' : document.cookie));

	const getToken = () => readCookie(getCookies(), CSRF_COOKIE_NAME);
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
