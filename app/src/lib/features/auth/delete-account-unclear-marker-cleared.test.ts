/**
 * More ways the memory of an unclear delete try ends (plan `delete-account`, criteria 4 and 5).
 * A try with an unclear answer makes the next 401 on the DELETE count as `maybe` deleted. A 409
 * (a staff account, which the backend never deletes) ends it, and so does a sign-in with the
 * same email that finishes with a two-factor code, or a sign-up the backend answers with the
 * session it already has. Then a later 401 is a plain expiry, and nothing on this device is
 * deleted.
 */
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { isAppError, type AppError } from '#lib/api/index.js';
import {
	MOCK_PASSWORD,
	MOCK_TOTP_CODE,
	STAFF_EMAIL,
	TWO_FACTOR_EMAIL,
	VERIFIED_EMAIL
} from '#lib/mocks/fixtures.js';
import { cookieJarApi, server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { session } from './session.svelte';
import {
	authenticateMfa,
	deleteAccount,
	login,
	onSignOut,
	reauthenticate,
	reauthenticateMfa,
	resetBootstrap,
	signup,
	watchSessionExpiry
} from './services';

useMockApi();

const ME = 'http://localhost/api/v1/accounts/me';

let api: ReturnType<typeof cookieJarApi>;
let heard: (string | null)[];
let stops: (() => void)[];

beforeEach(() => {
	api = cookieJarApi();
	resetBootstrap();
	session.reset();
	heard = [];
	stops = [onSignOut((email) => heard.push(email)), watchSessionExpiry(() => {}, { api })];
});

afterEach(() => {
	for (const stop of stops) stop();
	session.reset();
});

/** The error a promise rejects with. */
async function failure(promise: Promise<unknown>): Promise<AppError> {
	try {
		await promise;
	} catch (cause) {
		if (isAppError(cause)) return cause;
		throw cause;
	}
	throw new Error('expected the call to fail');
}

/** A proxy's 502 page: the DELETE never reached the backend. */
const proxyPage = () =>
	new HttpResponse('<html><body>502</body></html>', {
		status: 502,
		headers: { 'Content-Type': 'text/html' }
	});

/** A delete try with an unclear answer while still signed in: this page remembers it. */
async function unclearTry(): Promise<void> {
	server.use(http.delete(ME, proxyPage, { once: true }));
	const first = await failure(deleteAccount({ api }));
	expect(first.status).toBe(502);
	expect(session.isSignedIn).toBe(true);
}

/** The session ends on the backend, and this device hears it. */
async function sessionEnds(): Promise<void> {
	mockStore.logout();
	const raced = await api.open.GET('/api/v1/accounts/me');
	expect(raced.response.status).toBe(401);
	expect(session.expired).toBe(true);
}

/** A plain expiry: the 401 is thrown, nothing is deleted and the watcher's expiry stands. */
async function expectPlainExpiry(): Promise<void> {
	const error = await failure(deleteAccount({ api }));
	expect(error.status).toBe(401);
	expect(heard).toEqual([]);
	expect(session.accountDeleted).toBeNull();
	expect(session.expired).toBe(true);
}

it('treats a 401 as a plain expiry after a 409 for a staff account', async () => {
	await login({ email: STAFF_EMAIL, password: MOCK_PASSWORD }, { api });
	await authenticateMfa(MOCK_TOTP_CODE, { api });
	await reauthenticateMfa(MOCK_TOTP_CODE, { api });
	heard = [];
	await unclearTry();

	// The next try reaches the backend, which never deletes a staff account.
	const refused = await failure(deleteAccount({ api }));
	expect(refused.status).toBe(409);
	expect(mockStore.accountByEmail(STAFF_EMAIL)).toBeDefined();

	// Later the session ends on the backend, and the player presses Delete again.
	mockStore.logout();
	await expectPlainExpiry();
});

it('treats a 401 as a plain expiry after a new sign-in with a two-factor code', async () => {
	await login({ email: TWO_FACTOR_EMAIL, password: MOCK_PASSWORD }, { api });
	await authenticateMfa(MOCK_TOTP_CODE, { api });
	await reauthenticate(MOCK_PASSWORD, { api });
	heard = [];
	await unclearTry();

	// The session ends, and the player signs in again: password, then the code.
	await sessionEnds();
	const waiting = await login({ email: TWO_FACTOR_EMAIL, password: MOCK_PASSWORD }, { api });
	expect(waiting.status).toBe('pending_mfa');
	await authenticateMfa(MOCK_TOTP_CODE, { api });
	expect(session.isSignedIn).toBe(true);

	// Later that session ends on the backend too, and the player presses Delete.
	mockStore.logout();
	await expectPlainExpiry();
});

it('treats a 401 as a plain expiry after a sign-up answered with a signed-in session', async () => {
	await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
	await reauthenticate(MOCK_PASSWORD, { api });
	heard = [];
	await unclearTry();

	// The session ends here. The player signs in again in another tab, then sends this page's
	// sign-up form. The backend answers 409 with the session it has: signed in with that email.
	// The mock sign-up never signs in by itself (a new account must verify first), so this is
	// the path where a sign-up ends signed in.
	await sessionEnds();
	expect(mockStore.login(VERIFIED_EMAIL, MOCK_PASSWORD)).toBe('ok');
	const state = await signup(
		{ birth_year: 1990, birth_month: 6, email: VERIFIED_EMAIL, password: MOCK_PASSWORD },
		{ api }
	);
	expect(state).toMatchObject({ status: 'signed_in', email: VERIFIED_EMAIL });

	// Later that session ends on the backend too, and the player presses Delete.
	mockStore.logout();
	await expectPlainExpiry();
});
