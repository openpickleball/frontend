/**
 * The auth calls, to allauth headless (`/_allauth/browser/v1`). Each one keeps the
 * session store current and throws an `AppError` when it fails.
 *
 * How this backend behaves (checked against its source), and what that means here:
 * - Verifying an email does NOT sign the player in. `POST email/verify` answers 401.
 * - A password reset with a key does NOT sign the player in either. It also answers 401.
 * - `POST email/verify/resend` always answers 409, because verification is by link, so
 *   there is no resend call here. Signing in again with the same email sends a new link.
 * - Signing up with an address that already has an account looks the same as a new
 *   sign-up: 401 with a pending `verify_email` flow. We never reveal which it was.
 * - A 401 that carries `flows` is session state, not an error. A pending `verify_email`
 *   flow means "check your email".
 * - Too many logins is a 429, which `toAppError` turns into code `throttled`.
 */
import {
	allauthParams,
	api as appApi,
	toAppError,
	type Api,
	type AppError
} from '#lib/api/index.js';
import { session, type SessionState } from './session.svelte.js';

let api: Api = appApi;

/** Use another API client. For tests, which need a base URL and a cookie jar in node. */
export function configureAuthApi(next: Api = appApi): void {
	api = next;
}

type Settled = { data?: unknown; error?: unknown; response: Response };

/** Await a call. A rejected fetch becomes a `network` AppError. */
async function settle(call: Promise<Settled>): Promise<Settled> {
	try {
		return await call;
	} catch (cause) {
		throw toAppError(cause);
	}
}

function fail(result: Settled): never {
	throw toAppError(result.error, result.response);
}

function emailOf(data: unknown): string | null {
	const user = (data as { data?: { user?: { email?: unknown } } } | undefined)?.data?.user;
	return typeof user?.email === 'string' ? user.email : null;
}

/** Read an allauth session answer: 200 signed in, 401 with flows, 410 no session. */
function stateOf(result: Settled): SessionState {
	const { status } = result.response;
	if (status === 200) {
		const email = emailOf(result.data);
		if (email) return { status: 'signed_in', email };
		fail(result);
	}
	if (status === 401) {
		const { flows } = toAppError(result.error, result.response);
		const pending = flows?.some((flow) => flow.id === 'verify_email' && flow.is_pending);
		return { status: pending ? 'pending_verification' : 'signed_out' };
	}
	if (status === 410) return { status: 'signed_out' };
	return fail(result);
}

/** Ask the backend who is signed in, and update the store. */
export async function refreshSession(): Promise<SessionState> {
	const state = stateOf(
		await settle(api.allauth.GET('/_allauth/{client}/v1/auth/session', { params: allauthParams }))
	);
	session.apply(state);
	return state;
}

let booting: Promise<void> | null = null;

/**
 * Start up once: set the CSRF cookie, then read the session. Call it before anything that
 * needs the session or an unsafe request. Later calls share the first one. If the backend
 * can't be reached the session stays `unknown` (treated as signed out) and the next call
 * tries again.
 */
export function bootstrap(): Promise<void> {
	booting ??= (async () => {
		await api.initCsrf();
		try {
			await refreshSession();
		} catch {
			booting = null;
		}
	})();
	return booting;
}

/** Forget that the session was read. For tests. */
export function resetBootstrap(): void {
	booting = null;
}

export type Credentials = { email: string; password: string };

/** If the backend says we are already signed in (409), take its word for it. */
async function alreadySignedIn(result: Settled): Promise<SessionState> {
	if (result.response.status !== 409) fail(result);
	return refreshSession();
}

/**
 * Sign in. Resolves to `signed_in`, or `pending_verification` when the email isn't
 * confirmed yet (the backend also sends a new link then). A wrong password is an
 * `AppError` with code `email_password_mismatch`.
 */
export async function login({ email, password }: Credentials): Promise<SessionState> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/login', {
			params: allauthParams,
			body: { email, password }
		})
	);
	const state = result.response.status === 409 ? await alreadySignedIn(result) : stateOf(result);
	if (state.status === 'signed_out') fail(result);
	session.apply(state, email);
	return state;
}

/**
 * Create an account. Resolves to `pending_verification`: the backend answers the same
 * for a new address and for one that already has an account, and so do we.
 */
export async function signup({ email, password }: Credentials): Promise<SessionState> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/signup', {
			params: allauthParams,
			body: { email, password }
		})
	);
	const state = result.response.status === 409 ? await alreadySignedIn(result) : stateOf(result);
	if (state.status === 'signed_out') fail(result);
	session.apply(state, email);
	return state;
}

const signOutListeners = new Set<(email: string | null) => void>();

/**
 * Run `listener` when the player signs out on purpose (not when a session expires), before the
 * session ends, with the account's email. Other features use it to delete what they keep on
 * this device. A throwing listener never stops the sign out. Returns a function that removes it.
 */
export function onSignOut(listener: (email: string | null) => void): () => void {
	signOutListeners.add(listener);
	return () => void signOutListeners.delete(listener);
}

/** Sign out. The backend answers 401, which is the signed-out session. */
export async function logout(): Promise<void> {
	const email = session.email;
	for (const listener of signOutListeners) {
		try {
			listener(email);
		} catch {
			// Cleaning up must never keep a player signed in.
		}
	}
	try {
		const result = await settle(
			api.allauth.DELETE('/_allauth/{client}/v1/auth/session', { params: allauthParams })
		);
		stateOf(result);
	} finally {
		// Even if the call failed, this device should not look signed in.
		session.apply({ status: 'signed_out' });
	}
}

/**
 * Verify an email with the key from the link. Resolves when it is verified, which does
 * not sign anyone in. An unknown, used or expired key is an `AppError` with code
 * `invalid_or_expired_key`.
 */
export async function verifyEmail(key: string): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/email/verify', {
			params: allauthParams,
			body: { key }
		})
	);
	// 401 is the success answer: confirmed, still signed out.
	if (result.response.status !== 401) fail(result);
	// A sign-up in this browser may have been waiting on this link.
	await refreshSession().catch(() => undefined);
}

/** Ask for a reset link. The answer is the same whether or not the address has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/password/request', {
			params: allauthParams,
			body: { email }
		})
	);
	if (!result.response.ok) fail(result);
}

/**
 * Is this reset link still good? False for an unknown, used or expired key. Any other
 * failure (such as no network) throws, so the caller doesn't call a good link bad.
 */
export async function checkResetKey(key: string): Promise<boolean> {
	const result = await settle(
		api.allauth.GET('/_allauth/{client}/v1/auth/password/reset', {
			params: { ...allauthParams, header: { 'X-Password-Reset-Key': key } }
		})
	);
	if (result.response.ok) return true;
	const error = toAppError(result.error, result.response);
	if (error.status === 400 && error.fields.key) return false;
	throw error;
}

/**
 * Set a new password with the key from the emailed link. Resolves when it is changed,
 * which does not sign anyone in. A bad password is an `AppError` with `fields.password`;
 * a bad key has `fields.key`.
 */
export async function resetPassword(key: string, password: string): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/password/reset', {
			params: allauthParams,
			body: { key, password }
		})
	);
	// 401 is the success answer: changed, still signed out.
	if (result.response.status !== 401) fail(result);
}

/**
 * Notice when the session ends while the app is open (it expired, or the player signed out on
 * another tab or device): the first 401 from the API marks this device signed out, then calls
 * `onExpired` once so the caller can send the player to sign in. A 401 while already signed
 * out changes nothing. Returns a function that stops watching.
 */
export function watchSessionExpiry(onExpired: () => void): () => void {
	return api.onUnauthenticated(() => {
		if (!session.isSignedIn) return;
		session.expire();
		onExpired();
	});
}

export type { AppError };
