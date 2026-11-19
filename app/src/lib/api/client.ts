import createClient, { type Client } from 'openapi-fetch';
import { CSRF_BOOTSTRAP_PATH, CSRF_COOKIE_NAME, createCsrfMiddleware, readCookie } from './csrf';
import { isAbortError, networkError } from './errors';
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
};

export function createApi(options: CreateApiOptions = {}): Api {
	const baseUrl = options.baseUrl ?? '';
	// fetch rejects only when no answer came, or when the request was aborted. Mark the first as
	// a network error here, so a later failure (such as a 200 that is not JSON) can't pass for one.
	const doFetch: typeof fetch = async (input, init) => {
		try {
			return await (options.fetch ?? globalThis.fetch)(input, init);
		} catch (cause) {
			throw isAbortError(cause) ? cause : networkError(cause);
		}
	};
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

	return { open, allauth, initCsrf: async () => (getToken() ? undefined : refresh()) };
}
