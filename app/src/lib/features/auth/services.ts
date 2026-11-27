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
 * - Too many logins is a 429, which `toAppError` turns into kind `throttled`.
 * - A login for an account with two-factor stops after the password: 401 with a pending
 *   `mfa_authenticate` flow. That is `pending_mfa`, not signed in. `POST auth/2fa/authenticate`
 *   with a code finishes it, and the backend keeps the stage across a reload.
 * - After every change to signed in, `loadAccountState` reads the organizer memberships and
 *   whether two-factor is on. It never throws, and nothing waits for it.
 */
import {
	allauthParams,
	api as appApi,
	isAppError,
	toAppError,
	type AllauthComponents,
	type Api,
	type ApiOption,
	type AppError
} from '#lib/api/index.js';
import {
	session,
	type AccountDeleted,
	type MfaType,
	type OrganizerMembership,
	type SessionState
} from './session.svelte.js';

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

/** The code kinds a pending two-factor step offers. A code from the app when it says none. */
function mfaTypesOf(types: readonly string[] | undefined): MfaType[] {
	const known = (types ?? []).filter(
		(type): type is MfaType => type === 'totp' || type === 'recovery_codes'
	);
	return known.length > 0 ? known : ['totp'];
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
		const mfa = flows?.find((flow) => flow.id === 'mfa_authenticate' && flow.is_pending);
		if (mfa) return { status: 'pending_mfa', types: mfaTypesOf(mfa.types) };
		const pending = flows?.some((flow) => flow.id === 'verify_email' && flow.is_pending);
		return { status: pending ? 'pending_verification' : 'signed_out' };
	}
	if (status === 410) return { status: 'signed_out' };
	return fail(result);
}

/**
 * Put the backend's answer in the store. When it signs an account in (from anything else, or
 * as another account), read that account's state too, without waiting for it.
 */
function applyState(state: SessionState, options: ApiOption, typedEmail?: string): void {
	const newlySignedIn =
		state.status === 'signed_in' && !(session.isSignedIn && session.email === state.email);
	session.apply(state, typedEmail);
	if (newlySignedIn) void loadAccountState(options);
}

/** Ask the backend who is signed in, and update the store. */
export async function refreshSession({ api = appApi }: ApiOption = {}): Promise<SessionState> {
	const state = stateOf(
		await settle(api.allauth.GET('/_allauth/{client}/v1/auth/session', { params: allauthParams }))
	);
	applyState(state, { api });
	return state;
}

/**
 * Read what the signed-in account's screens need besides the session: its organizer memberships
 * (`GET organizer/organizers`) and whether two-factor is on (`GET account/authenticators`), in
 * parallel. A failed call leaves the safe answer: no memberships, and two-factor unknown. It
 * never throws. An answer for an account that is no longer signed in is dropped.
 */
export function loadAccountState(options: ApiOption = {}): Promise<void> {
	const loading = readAccountState(options);
	accountStateLoading = loading;
	void loading.finally(() => {
		if (accountStateLoading === loading) accountStateLoading = null;
	});
	return loading;
}

/**
 * Is two-factor (TOTP) on for the signed-in account? From `GET account/authenticators`, which
 * allauth answers even to a session the OPEN API refuses with `mfa_required`. Null when unknown.
 */
async function readEnrolled(api: Api): Promise<boolean | null> {
	try {
		const result = await settle(
			api.allauth.GET('/_allauth/{client}/v1/account/authenticators', { params: allauthParams })
		);
		if (!result.response.ok) return null;
		const list = (result.data as { data?: { type?: unknown }[] } | undefined)?.data;
		return Array.isArray(list) ? list.some((item) => item.type === 'totp') : null;
	} catch {
		return null;
	}
}

/**
 * The signed-in account's organizer memberships, once known: it waits for any read in flight
 * (sign-in starts one without waiting), and runs one when the list is still unknown or the last
 * read failed. Empty when the read fails. Call it after the session is read.
 */
export async function settledMemberships(options: ApiOption = {}): Promise<OrganizerMembership[]> {
	// A read that failed while this call waited for it is not tried again at once, so one visit
	// makes one read. The next visit tries again.
	let waited = false;
	while (accountStateLoading) {
		waited = true;
		await accountStateLoading;
	}
	const retry = session.organizersFailed && !waited;
	if (session.isSignedIn && (session.organizers === null || retry)) await loadAccountState(options);
	return session.organizers ?? [];
}

/** Counts the account state reads started, so only the newest one writes the organizer list. */
let accountReads = 0;

/** The account state read in flight, so a notice can wait until two-factor is known. */
let accountStateLoading: Promise<void> | null = null;

async function readAccountState({ api = appApi }: ApiOption = {}): Promise<void> {
	const email = session.isSignedIn ? session.email : null;
	if (!email) return;
	const current = () => session.isSignedIn && session.email === email;
	const revision = session.mfaRevision;
	const read = ++accountReads;
	const organizers = (async (): Promise<OrganizerMembership[] | null> => {
		try {
			const result = await settle(api.open.GET('/api/v1/organizer/organizers'));
			return result.response.ok && Array.isArray(result.data) ? result.data : null;
		} catch {
			return null;
		}
	})();
	const enrolled = readEnrolled(api);
	const [memberships, mfa] = await Promise.all([organizers, enrolled]);
	if (!current()) return;
	// Only the newest read writes the list: an older one may have been refused before the session
	// passed two-factor, and would overwrite the real memberships.
	// A failed read leaves no memberships, the safe answer, and marks them to be read again.
	if (read === accountReads) {
		session.organizers = memberships ?? [];
		session.organizersFailed = memberships === null;
	}
	// A value set while this read waited (turning TOTP on, say) is newer: keep it.
	if (session.mfaRevision === revision) session.mfaEnrolled = mfa;
}

let booting: Promise<void> | null = null;

/**
 * Start up once: set the CSRF cookie, then read the session. Call it before anything that
 * needs the session or an unsafe request. Later calls share the first one. If the backend
 * can't be reached the session stays `unknown` (treated as signed out) and the next call
 * tries again. A later call shares the first one's client too.
 */
export function bootstrap({ api = appApi }: ApiOption = {}): Promise<void> {
	booting ??= (async () => {
		await api.initCsrf();
		try {
			await refreshSession({ api });
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

/**
 * What sign-up sends, taken from the generated allauth schema: the credentials, the birth month
 * and year (no day, ADR 0017), the division, the names, an optional city and region, and the two
 * agreements. The backend checks all of it.
 */
export type SignupDetails = AllauthComponents['schemas']['Signup'];

/** What the age check sends: only the birth year and month. */
export type SignupAge = { birth_year: number; birth_month: number };

/** If the backend says we are already signed in (409), take its word for it. */
async function alreadySignedIn(result: Settled, options: ApiOption): Promise<SessionState> {
	if (result.response.status !== 409) fail(result);
	return refreshSession(options);
}

/**
 * Sign in. Resolves to `signed_in`, `pending_verification` when the email isn't
 * confirmed yet (the backend also sends a new link then), or `pending_mfa` when the account
 * has two-factor and a code comes next. A wrong password is an `AppError` with code
 * `email_password_mismatch`.
 */
export async function login(
	{ email, password }: Credentials,
	{ api = appApi }: ApiOption = {}
): Promise<SessionState> {
	// A new attempt: the reason the last code step ended no longer applies, even if this one fails.
	session.mfaTimedOut = false;
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/login', {
			params: allauthParams,
			body: { email, password }
		})
	);
	const state =
		result.response.status === 409 ? await alreadySignedIn(result, { api }) : stateOf(result);
	if (state.status === 'signed_out') fail(result);
	applyState(state, { api }, email);
	return state;
}

/**
 * Finish a two-factor login with a code from the app or a recovery code. Resolves to
 * `signed_in`. A wrong code is an `AppError` with a message on `fields.code`, and the login
 * stays at the code step. When no login is waiting any more, the store takes the session as it
 * now is.
 */
export async function authenticateMfa(
	code: string,
	{ api = appApi }: ApiOption = {}
): Promise<SessionState> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/2fa/authenticate', {
			params: allauthParams,
			body: { code }
		})
	);
	const { status } = result.response;
	if (status !== 200 && status !== 401 && status !== 409) fail(result);
	let state: SessionState;
	if (status === 409) {
		// No login is waiting: take the session as it now is.
		state = await refreshSession({ api });
	} else {
		state = stateOf(result);
		applyState(state, { api });
	}
	if (state.status === 'signed_in') return state;
	// The login's two-factor stage ran out: the sign-in page says why it is back.
	if (state.status !== 'pending_mfa') session.mfaTimedOut = true;
	return fail(result);
}

/** "Start over" at the code step: end the waiting login, then this device is signed out. */
export async function cancelMfa({ api = appApi }: ApiOption = {}): Promise<void> {
	try {
		await settle(
			api.allauth.DELETE('/_allauth/{client}/v1/auth/session', { params: allauthParams })
		);
	} finally {
		session.apply({ status: 'signed_out' });
	}
}

/**
 * Confirm it is the player with the password, for a call that needs a recent reauthentication.
 * A wrong password is an `AppError` with a message on `fields.password`.
 */
export async function reauthenticate(
	password: string,
	{ api = appApi }: ApiOption = {}
): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/reauthenticate', {
			params: allauthParams,
			body: { password }
		})
	);
	if (!result.response.ok) fail(result);
}

/**
 * Confirm it is the player with a two-factor code (from the app, or a recovery code). It also
 * counts as passing two-factor for this session. A wrong code is an `AppError` with a message on
 * `fields.code`.
 */
export async function reauthenticateMfa(
	code: string,
	{ api = appApi }: ApiOption = {}
): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/2fa/reauthenticate', {
			params: allauthParams,
			body: { code }
		})
	);
	if (!result.response.ok) fail(result);
	// The session passed two-factor now, so calls the API refused before may answer: read again.
	void loadAccountState({ api });
}

/**
 * Create an account. Resolves to `pending_verification`: the backend answers the same
 * for a new address and for one that already has an account, and so do we. An age the
 * backend refuses is an `AppError` with code `signup_refused` and no field.
 */
export async function signup(
	details: SignupDetails,
	{ api = appApi }: ApiOption = {}
): Promise<SessionState> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/signup', {
			params: allauthParams,
			body: details
		})
	);
	const state =
		result.response.status === 409 ? await alreadySignedIn(result, { api }) : stateOf(result);
	if (state.status === 'signed_out') fail(result);
	session.apply(state, details.email);
	return state;
}

/**
 * Check the birth month and year before asking for anything else. Resolves when the backend
 * accepts them. An age it refuses is an `AppError` with code `signup_refused` and no field,
 * and the backend then refuses every later sign-up in this session the same way. A missing
 * or malformed value carries `fields`. It never changes the session store.
 */
export async function checkSignupAge(
	{ birth_year, birth_month }: SignupAge,
	{ api = appApi }: ApiOption = {}
): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/signup/age-check', {
			params: allauthParams,
			body: { birth_year, birth_month }
		})
	);
	if (result.response.status !== 200) fail(result);
}

/**
 * Check a new password with the backend's password rules before the rest of sign-up. Resolves
 * when it passes. A password the rules refuse is an `AppError` with a message on `fields.password`.
 * Nothing is stored and no email is sent: sign-up checks the password again.
 */
export async function checkSignupPassword(
	{ email, password }: Credentials,
	{ api = appApi }: ApiOption = {}
): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/signup/password-check', {
			params: allauthParams,
			body: { email, password }
		})
	);
	if (result.response.status !== 200) fail(result);
}

const signOutListeners = new Set<(email: string | null) => void>();

/**
 * Run `listener` when the player signs out on purpose or deletes their account (not when a
 * session expires), before the session ends, with the account's email. Other features use it to
 * delete what they keep on this device. A throwing listener never stops the sign out. Returns a
 * function that removes it.
 */
export function onSignOut(listener: (email: string | null) => void): () => void {
	signOutListeners.add(listener);
	return () => void signOutListeners.delete(listener);
}

let signOutWarningSource: () => string | null = () => null;

/**
 * Say what signing out would delete, so every Sign out button can ask first. `source` returns the
 * warning, or null when there is nothing to warn about. The root layout sets it once (the offline
 * queue's unsent matches). Returns a function that removes it.
 */
export function setSignOutWarning(source: () => string | null): () => void {
	signOutWarningSource = source;
	return () => {
		if (signOutWarningSource === source) signOutWarningSource = () => null;
	};
}

/** The warning to show before signing out, or null to sign out at once. */
export function signOutWarning(): string | null {
	try {
		return signOutWarningSource();
	} catch {
		return null;
	}
}

let unsentMatchesSource: () => number = () => 0;

/**
 * Say how many matches on this device have not reached the backend, so deleting the account can
 * warn that it deletes them too. The root layout sets it once (the offline queue). Returns a
 * function that removes it.
 */
export function setUnsentMatchesSource(source: () => number): () => void {
	unsentMatchesSource = source;
	return () => {
		if (unsentMatchesSource === source) unsentMatchesSource = () => 0;
	};
}

/** How many matches on this device have not been sent. 0 when unknown. */
export function unsentMatches(): number {
	try {
		return unsentMatchesSource();
	} catch {
		return 0;
	}
}

/** Tell every `onSignOut` listener, before the session changes. */
function runSignOutListeners(email: string | null): void {
	for (const listener of signOutListeners) {
		try {
			listener(email);
		} catch {
			// Cleaning up must never keep a player signed in.
		}
	}
}

/** Sign out. The backend answers 401, which is the signed-out session. */
export async function logout({ api = appApi }: ApiOption = {}): Promise<void> {
	runSignOutListeners(session.email);
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
 * Delete the signed-in account (`DELETE /api/v1/accounts/me`). On 204 the backend has ended every
 * session of the account, so this ends it here too (`endDeletedAccount`) before it resolves, and
 * resolves `deleted`. No code that waits on it sees a signed-in session, so a later 401 can't make
 * it look expired. The email is read before the request is sent: a request that raced the delete
 * may get its 401 first and sign this device out, and the cleanup still needs the deleted
 * account's email.
 *
 * When no answer comes (a timeout or a dropped connection), the backend may still have deleted
 * the account. It asks allauth once whether this device is signed in (`refreshSession`, which an
 * OPEN 401 watcher never hears). Signed out: it ends the account as `maybe` deleted and resolves
 * `maybe`. Still signed in, or the check failed too: it throws the network error.
 *
 * Anything else is an `AppError`, such as 403 `reauthentication_required` (run it through
 * `withReauth`), 403 `mfa_required`, 409 `conflict` for a staff account, or `throttled`.
 */
export async function deleteAccount({ api = appApi }: ApiOption = {}): Promise<AccountDeleted> {
	const email = session.email;
	let result: Settled;
	try {
		result = await settle(api.open.DELETE('/api/v1/accounts/me'));
	} catch (cause) {
		if (isAppError(cause) && cause.kind === 'network' && (await signedOutNow(api))) {
			endDeletedAccount(email, 'maybe');
			return 'maybe';
		}
		throw cause;
	}
	if (result.response.status !== 204) fail(result);
	endDeletedAccount(email);
	return 'deleted';
}

/** Does allauth say nobody is signed in on this device? False when it can't tell. */
async function signedOutNow(api: Api): Promise<boolean> {
	try {
		return (await refreshSession({ api })).status === 'signed_out';
	} catch {
		return false;
	}
}

/**
 * The account is gone: delete what this device keeps for it (the `onSignOut` listeners, with
 * `email`, the deleted account's address), then sign out and set `session.accountDeleted` to
 * `state`. `deleteAccount` calls it with the email it read before sending, so callers don't.
 */
export function endDeletedAccount(
	email: string | null = session.email,
	state: AccountDeleted = 'deleted'
): void {
	runSignOutListeners(email);
	session.markDeleted(state);
}

/**
 * Verify an email with the key from the link. Resolves when it is verified, which does
 * not sign anyone in. An unknown, used or expired key is an `AppError` with code
 * `invalid_or_expired_key`.
 */
export async function verifyEmail(key: string, { api = appApi }: ApiOption = {}): Promise<void> {
	const result = await settle(
		api.allauth.POST('/_allauth/{client}/v1/auth/email/verify', {
			params: allauthParams,
			body: { key }
		})
	);
	// 401 is the success answer: confirmed, still signed out.
	if (result.response.status !== 401) fail(result);
	// A sign-up in this browser may have been waiting on this link.
	await refreshSession({ api }).catch(() => undefined);
}

/** Ask for a reset link. The answer is the same whether or not the address has an account. */
export async function requestPasswordReset(
	email: string,
	{ api = appApi }: ApiOption = {}
): Promise<void> {
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
export async function checkResetKey(
	key: string,
	{ api = appApi }: ApiOption = {}
): Promise<boolean> {
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
export async function resetPassword(
	key: string,
	password: string,
	{ api = appApi }: ApiOption = {}
): Promise<void> {
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
export function watchSessionExpiry(
	onExpired: () => void,
	{ api = appApi }: ApiOption = {}
): () => void {
	return api.onUnauthenticated(() => {
		if (!session.isSignedIn) return;
		session.expire();
		onExpired();
	});
}

export type { AppError };

/**
 * Notice every 403 `mfa_required` from the API, so one place can explain it. `notify` gets
 * whether the account has two-factor: then this session only has to confirm with a code;
 * otherwise two-factor needs setting up. Returns a function that stops watching.
 */
export function watchMfaRequired(
	notify: (enrolled: boolean) => void,
	{ api = appApi }: ApiOption = {}
): () => void {
	return api.onMfaRequired(() => {
		// The refusal belongs to the account signed in now. Any later account is not told about it.
		const email = session.isSignedIn ? session.email : null;
		if (!email) return;
		const same = () => session.isSignedIn && session.email === email;
		// Right after a sign-in two-factor may still be loading: wait for it, so an account that
		// has it is offered the code and not told to set it up.
		const loading = accountStateLoading ?? Promise.resolve();
		void loading.then(async () => {
			if (!same()) return;
			// The cached answer may be old: two-factor turned on from another device is the usual
			// way a session meets this refusal. Unless it already says on, ask again.
			if (session.mfaEnrolled !== true) {
				await checkMfaEnrolled({ api });
				if (!same()) return;
			}
			notify(session.mfaEnrolled === true);
		});
	});
}

/**
 * Ask allauth again whether two-factor is on for the signed-in account, and keep
 * `session.mfaEnrolled` current. Resolves to the answer, or null when it is unknown or another
 * account signed in while it asked (then nothing is written). A value set while it asked is
 * newer, so it is kept and returned.
 */
export async function checkMfaEnrolled({ api = appApi }: ApiOption = {}): Promise<boolean | null> {
	if (!session.isSignedIn) return null;
	const email = session.email;
	const revision = session.mfaRevision;
	const fresh = await readEnrolled(api);
	if (!session.isSignedIn || session.email !== email) return null;
	// A value set while this read waited (turning TOTP on, say) is newer: keep it.
	if (session.mfaRevision !== revision) return session.mfaEnrolled;
	if (fresh !== null) session.mfaEnrolled = fresh;
	return fresh;
}
