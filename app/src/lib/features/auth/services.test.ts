import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi, isAppError, type Api, type AppError } from '#lib/api/index.js';
import {
	MOCK_KEYS,
	MOCK_PASSWORD,
	MOCK_RECOVERY_CODES,
	MOCK_TOTP_CODE,
	MFA_REQUIRED_EMAIL,
	ORGANIZER_EMAIL,
	TWO_FACTOR_EMAIL,
	UNVERIFIED_EMAIL,
	VERIFIED_EMAIL
} from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { isThrottled } from './forms';
import { redirectFor } from './guard';
import { session } from './session.svelte';
import {
	authenticateMfa,
	bootstrap,
	cancelMfa,
	checkResetKey,
	checkSignupAge,
	checkSignupPassword,
	login,
	loadAccountState,
	logout,
	onSignOut,
	reauthenticate,
	reauthenticateMfa,
	requestPasswordReset,
	resetBootstrap,
	resetPassword,
	signup,
	verifyEmail,
	watchMfaRequired,
	watchSessionExpiry
} from './services';

useMockApi();

const BASE = 'http://localhost';
const AUTH = `${BASE}/_allauth/browser/v1/auth`;

/** The real client with a cookie jar, as a browser has. */
function browserApi() {
	const jar = new Map<string, string>();
	const fetchWithJar: typeof fetch = async (input, init) => {
		const response = await fetch(input, init);
		for (const line of response.headers.getSetCookie()) {
			const [pair] = line.split(';');
			const [name, ...value] = pair.split('=');
			jar.set(name.trim(), value.join('='));
		}
		return response;
	};
	const getCookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	return createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies });
}

let api: Api;

beforeEach(() => {
	api = browserApi();
	resetBootstrap();
	session.reset();
});

/** A made-up adult's sign-up details, as the form parses them. */
const BORN = {
	birth_year: 1990,
	birth_month: 6,
	gender_division: 'mens',
	first_name: 'Sam',
	last_name: 'Rivera',
	accepted_terms: true,
	accepted_privacy: true
} as const;

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

const lastMail = () => mockStore.state.outbox.at(-1);

describe('session store', () => {
	it('starts unknown and signed out of everything', () => {
		expect(session.status).toBe('unknown');
		expect(session.isSignedIn).toBe(false);
		expect(session.email).toBeNull();
	});

	it('keeps the typed email while verification is pending, and forgets it after', () => {
		session.apply({ status: 'pending_verification' }, 'tamsin@example.com');
		expect(session.status).toBe('pending_verification');
		expect(session.email).toBe('tamsin@example.com');
		session.clearPending();
		expect(session.status).toBe('signed_out');
		expect(session.email).toBeNull();
	});

	it('clearPending leaves a signed-in session alone', () => {
		session.apply({ status: 'signed_in', email: VERIFIED_EMAIL });
		session.clearPending();
		expect(session.isSignedIn).toBe(true);
	});
});

describe('bootstrap', () => {
	it('reads a signed-out session', async () => {
		await bootstrap({ api });
		expect(session.status).toBe('signed_out');
	});

	it('reads a signed-in session', async () => {
		await bootstrap({ api });
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		session.reset();
		resetBootstrap();
		await bootstrap({ api });
		expect(session.status).toBe('signed_in');
		expect(session.email).toBe(VERIFIED_EMAIL);
	});

	it('reads a pending verification from the 401 flows, not as an error', async () => {
		await signup(
			{ ...BORN, email: 'new.player@example.com', password: 'a-long-enough-pass' },
			{ api }
		);
		session.reset();
		resetBootstrap();
		await bootstrap({ api });
		expect(session.status).toBe('pending_verification');
	});

	it('runs once, and tries again after a network failure', async () => {
		let calls = 0;
		server.use(
			http.get(`${AUTH}/session`, () => {
				calls += 1;
				return HttpResponse.error();
			})
		);
		await bootstrap({ api });
		expect(session.status).toBe('unknown');
		server.resetHandlers();
		await bootstrap({ api });
		expect(calls).toBe(1);
		expect(session.status).toBe('signed_out');
		await bootstrap({ api });
		expect(session.status).toBe('signed_out');
	});
});

describe('login', () => {
	it('signs in a verified account', async () => {
		const state = await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		expect(state).toEqual({ status: 'signed_in', email: VERIFIED_EMAIL });
		expect(session.isSignedIn).toBe(true);
		expect(session.email).toBe(VERIFIED_EMAIL);
	});

	it('rejects a wrong password with the mismatch code and stays signed out', async () => {
		const error = await failure(
			login({ email: VERIFIED_EMAIL, password: 'not-the-password' }, { api })
		);
		expect(error.code).toBe('email_password_mismatch');
		expect(session.isSignedIn).toBe(false);
	});

	it('answers an unverified account with pending verification, and a new link', async () => {
		const state = await login({ email: UNVERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		expect(state).toEqual({ status: 'pending_verification' });
		expect(session.status).toBe('pending_verification');
		expect(session.email).toBe(UNVERIFIED_EMAIL);
		expect(lastMail()).toMatchObject({ kind: 'verify_email', to: UNVERIFIED_EMAIL });
	});

	it('treats a 429 as throttled, with the app message', async () => {
		// allauth's rate limit answers a bare {"status":429}, with no errors.
		server.use(
			http.post(`${AUTH}/login`, () => HttpResponse.json({ status: 429 }, { status: 429 }))
		);
		const error = await failure(login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api }));
		expect(error.code).toBe('throttled');
		expect(error.kind).toBe('throttled');
		expect(isThrottled(error)).toBe(true);
		expect(error.message).toBe('Too many attempts. Wait a moment and try again.');
		expect(session.isSignedIn).toBe(false);
	});

	it('treats a login lockout (400 too_many_login_attempts) as throttled', async () => {
		server.use(
			http.post(`${AUTH}/login`, () =>
				HttpResponse.json(
					{
						status: 400,
						errors: [
							{ code: 'too_many_login_attempts', message: 'Too many failed login attempts.' }
						]
					},
					{ status: 400 }
				)
			)
		);
		const error = await failure(login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api }));
		expect(error.kind).toBe('throttled');
		expect(isThrottled(error)).toBe(true);
		expect(error.message).toBe('Too many failed login attempts.');
	});

	it('reports a network failure', async () => {
		server.use(http.post(`${AUTH}/login`, () => HttpResponse.error()));
		const error = await failure(login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api }));
		expect(error.kind).toBe('network');
	});
});

describe('checkSignupPassword', () => {
	const PASSWORD_CHECK = `${AUTH}/signup/password-check`;
	const EMAIL = 'new.player@example.com';

	it('sends the email and password, and resolves for a strong password', async () => {
		let body: unknown;
		server.use(
			http.post(PASSWORD_CHECK, async ({ request }) => {
				body = await request.json();
				return HttpResponse.json({ status: 200 });
			})
		);
		await expect(
			checkSignupPassword({ email: EMAIL, password: 'a-fine-password-9' }, { api })
		).resolves.toBe(undefined);
		expect(body).toStrictEqual({ email: EMAIL, password: 'a-fine-password-9' });
		expect(session.status).toBe('unknown');
	});

	it.each([
		['too common', 'password1', 'This password is too common.'],
		['entirely numeric', '73519846', 'This password is entirely numeric.'],
		['like the email', 'new.player-2026', 'The password is too similar to the email address.']
	])('puts the message on the password field when it is %s', async (_, password, message) => {
		const error = await failure(checkSignupPassword({ email: EMAIL, password }, { api }));
		expect(error.kind).toBe('validation');
		expect(error.fields.password).toContain(message);
		expect(session.status).toBe('unknown');
	});
});

describe('checkSignupAge', () => {
	const AGE = `${AUTH}/signup/age-check`;

	it('sends the birth year and month as numbers, and nothing else', async () => {
		let body: unknown;
		server.use(
			http.post(AGE, async ({ request }) => {
				body = await request.json();
				return HttpResponse.json({ status: 200 });
			})
		);
		await expect(checkSignupAge({ birth_year: 1990, birth_month: 6 }, { api })).resolves.toBe(
			undefined
		);
		expect(body).toStrictEqual({ birth_year: 1990, birth_month: 6 });
	});

	it('does not touch the session', async () => {
		server.use(http.post(AGE, () => HttpResponse.json({ status: 200 })));
		await checkSignupAge({ birth_year: 1990, birth_month: 6 }, { api });
		expect(session.status).toBe('unknown');
	});

	it('rejects with signup_refused and no field when the age is refused', async () => {
		server.use(
			http.post(AGE, () =>
				HttpResponse.json(
					{
						status: 400,
						errors: [
							{ code: 'signup_refused', message: "We can't create an account with these details." }
						]
					},
					{ status: 400 }
				)
			)
		);
		const error = await failure(checkSignupAge({ birth_year: 2020, birth_month: 6 }, { api }));
		expect(error.code).toBe('signup_refused');
		expect(error.fields).toEqual({});
		expect(session.status).toBe('unknown');
	});

	it('rejects with the field errors when a value is malformed', async () => {
		server.use(
			http.post(AGE, () =>
				HttpResponse.json(
					{
						status: 400,
						errors: [{ code: 'invalid', message: 'Enter your birth year.', param: 'birth_year' }]
					},
					{ status: 400 }
				)
			)
		);
		const error = await failure(checkSignupAge({ birth_year: 0, birth_month: 6 }, { api }));
		expect(error.fields.birth_year).toEqual(['Enter your birth year.']);
	});

	it('is a network error when the request fails', async () => {
		server.use(http.post(AGE, () => HttpResponse.error()));
		const error = await failure(checkSignupAge({ birth_year: 1990, birth_month: 6 }, { api }));
		expect(error.kind).toBe('network');
	});
});

describe('signup', () => {
	const pending = () =>
		HttpResponse.json(
			{ status: 401, data: { flows: [{ id: 'verify_email', is_pending: true }] }, meta: {} },
			{ status: 401 }
		);

	it('sends every field, next to the email and password', async () => {
		let body: unknown;
		server.use(
			http.post(`${AUTH}/signup`, async ({ request }) => {
				body = await request.json();
				return pending();
			})
		);
		await signup(
			{
				...BORN,
				gender_division: 'womens',
				email: 'new.player@example.com',
				password: 'a-long-enough-pass'
			},
			{ api }
		);
		expect(body).toStrictEqual({
			email: 'new.player@example.com',
			password: 'a-long-enough-pass',
			birth_year: 1990,
			birth_month: 6,
			gender_division: 'womens',
			first_name: 'Sam',
			last_name: 'Rivera',
			accepted_terms: true,
			accepted_privacy: true
		});
	});

	it('sends the city and region when given', async () => {
		let body: unknown;
		server.use(
			http.post(`${AUTH}/signup`, async ({ request }) => {
				body = await request.json();
				return pending();
			})
		);
		await signup(
			{
				...BORN,
				city: 'Austin',
				region: 'Texas',
				email: 'new.player@example.com',
				password: 'a-long-enough-pass'
			},
			{ api }
		);
		expect(body).toMatchObject({ city: 'Austin', region: 'Texas', first_name: 'Sam' });
	});

	it('answers a new address with pending verification and mails a link', async () => {
		const state = await signup(
			{ ...BORN, email: 'new.player@example.com', password: 'a-long-enough-pass' },
			{ api }
		);
		expect(state).toEqual({ status: 'pending_verification' });
		expect(session.email).toBe('new.player@example.com');
		expect(lastMail()).toMatchObject({ kind: 'verify_email', to: 'new.player@example.com' });
	});

	it('answers an address that already has an account exactly the same way', async () => {
		const fresh = await signup(
			{ ...BORN, email: 'new.player@example.com', password: 'a-long-enough-pass' },
			{ api }
		);
		const freshSession = { status: session.status };
		session.reset();
		const existing = await signup(
			{ ...BORN, email: VERIFIED_EMAIL, password: 'a-long-enough-pass' },
			{ api }
		);
		expect(existing).toEqual(fresh);
		expect({ status: session.status }).toEqual(freshSession);
		expect(lastMail()?.kind).toBe('account_exists');
	});

	it('maps a weak password onto its field', async () => {
		const error = await failure(
			signup({ ...BORN, email: 'new.player@example.com', password: 'password' }, { api })
		);
		expect(error.kind).toBe('validation');
		expect(error.fields.password?.length).toBeGreaterThan(0);
		expect(session.status).not.toBe('pending_verification');
	});
});

describe('verifyEmail', () => {
	it('confirms the address and does not sign the player in', async () => {
		await verifyEmail(MOCK_KEYS.verifyEmail, { api });
		expect(session.isSignedIn).toBe(false);
		const state = await login({ email: UNVERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		expect(state.status).toBe('signed_in');
	});

	it('works with the key from a sign-up email, then the player can sign in', async () => {
		await signup(
			{ ...BORN, email: 'new.player@example.com', password: 'a-long-enough-pass' },
			{ api }
		);
		const key = lastMail()?.key as string;
		await verifyEmail(key, { api });
		// The pending state is cleared once the address is confirmed.
		expect(session.status).toBe('signed_out');
		const state = await login(
			{ email: 'new.player@example.com', password: 'a-long-enough-pass' },
			{ api }
		);
		expect(state.status).toBe('signed_in');
	});

	it('rejects an unknown or used key', async () => {
		const unknown = await failure(verifyEmail('nope', { api }));
		expect(unknown.status).toBe(400);
		expect(unknown.code).toBe('invalid_or_expired_key');
		await verifyEmail(MOCK_KEYS.verifyEmail, { api });
		// The mock keeps verify keys valid, but a key for no account is refused.
		expect(
			(await failure(verifyEmail('another-bad-key', { api }))).fields.key?.length
		).toBeGreaterThan(0);
	});
});

describe('logout', () => {
	it('signs the player out', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		await logout({ api });
		expect(session.status).toBe('signed_out');
		expect(session.email).toBeNull();
		resetBootstrap();
		await bootstrap({ api });
		expect(session.isSignedIn).toBe(false);
	});

	it('clears the session on this device even when the call fails', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		server.use(http.delete(`${AUTH}/session`, () => HttpResponse.error()));
		await expect(logout({ api })).rejects.toMatchObject({ kind: 'network' });
		expect(session.status).toBe('signed_out');
	});
});

describe('onSignOut', () => {
	it('tells listeners the account email before the session ends', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		const heard: [string | null, boolean][] = [];
		const stop = onSignOut((email) => heard.push([email, session.isSignedIn]));
		await logout({ api });
		stop();
		expect(heard).toEqual([[VERIFIED_EMAIL, true]]);
	});

	it('still signs out when a listener throws, and stops after it is removed', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		let calls = 0;
		const stopBad = onSignOut(() => {
			throw new Error('storage is blocked');
		});
		const stop = onSignOut(() => calls++);
		await logout({ api });
		expect(session.status).toBe('signed_out');
		expect(calls).toBe(1);

		stop();
		stopBad();
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		await logout({ api });
		expect(calls).toBe(1);
	});

	it('is not called when a session expires', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		let signedOut = 0;
		const stop = onSignOut(() => signedOut++);
		const stopWatch = watchSessionExpiry(() => {}, { api });
		mockStore.logout();
		await api.open.GET('/api/v1/accounts/me');
		stop();
		stopWatch();
		expect(signedOut).toBe(0);
	});
});

describe('password reset', () => {
	it('mails a link for a known address', async () => {
		await requestPasswordReset(VERIFIED_EMAIL, { api });
		expect(lastMail()).toMatchObject({ kind: 'reset_password', to: VERIFIED_EMAIL });
	});

	it('answers an unknown address the same way and sends nothing', async () => {
		const before = mockStore.state.outbox.length;
		await expect(requestPasswordReset('nobody@example.com', { api })).resolves.toBeUndefined();
		expect(mockStore.state.outbox).toHaveLength(before);
	});

	it('checks whether a link still works', async () => {
		await expect(checkResetKey(MOCK_KEYS.resetPassword, { api })).resolves.toBe(true);
		await expect(checkResetKey('nope', { api })).resolves.toBe(false);
	});

	it('does not call a good link bad when the network fails', async () => {
		server.use(http.get(`${AUTH}/password/reset`, () => HttpResponse.error()));
		await expect(checkResetKey(MOCK_KEYS.resetPassword, { api })).rejects.toMatchObject({
			kind: 'network'
		});
	});

	it('sets a new password without signing in, and the new one works', async () => {
		await resetPassword(MOCK_KEYS.resetPassword, 'a-brand-new-pass-77', { api });
		expect(session.isSignedIn).toBe(false);
		await expect(
			login({ email: VERIFIED_EMAIL, password: 'a-brand-new-pass-77' }, { api })
		).resolves.toMatchObject({ status: 'signed_in' });
	});

	it('refuses a weak password with a field error', async () => {
		const error = await failure(resetPassword(MOCK_KEYS.resetPassword, 'password', { api }));
		expect(error.fields.password?.length).toBeGreaterThan(0);
	});

	it('refuses a bad key with a key error', async () => {
		const error = await failure(resetPassword('nope', 'a-brand-new-pass-77', { api }));
		expect(error.fields.key?.length).toBeGreaterThan(0);
	});
});

describe('watchSessionExpiry', () => {
	it('signs this device out and calls back once when the API answers 401', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		expect(session.isSignedIn).toBe(true);

		let expired = 0;
		const stop = watchSessionExpiry(() => expired++, { api });
		// The session ends on the backend, as after a sign out on another device.
		mockStore.logout();
		await api.open.GET('/api/v1/accounts/me');
		await api.open.GET('/api/v1/accounts/me');
		stop();

		expect(session.status).toBe('signed_out');
		expect(session.email).toBeNull();
		expect(session.expired).toBe(true);
		expect(expired).toBe(1);
	});

	it('does nothing while nobody is signed in', async () => {
		session.apply({ status: 'signed_out' });
		let expired = 0;
		const stop = watchSessionExpiry(() => expired++, { api });
		await api.open.GET('/api/v1/accounts/me');
		stop();
		expect(expired).toBe(0);
		expect(session.expired).toBe(false);
	});

	it('forgets that the session expired once the player signs in again', async () => {
		session.apply({ status: 'signed_in', email: VERIFIED_EMAIL });
		session.expire();
		expect(session.expired).toBe(true);
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		expect(session.expired).toBe(false);
	});
});

/** Let the account state calls that run after a sign-in answer. */
async function settled(): Promise<void> {
	await loadAccountState({ api });
}

describe('two-factor sign-in', () => {
	const twoFactor = { email: TWO_FACTOR_EMAIL, password: MOCK_PASSWORD };

	it('stops at the code step after a correct password, not signed in', async () => {
		const state = await login(twoFactor, { api });
		expect(state).toEqual({ status: 'pending_mfa', types: ['totp', 'recovery_codes'] });
		expect(session.status).toBe('pending_mfa');
		expect(session.mfaTypes).toEqual(['totp', 'recovery_codes']);
		expect(session.isSignedIn).toBe(false);
	});

	it('signs in with the code from the app', async () => {
		await login(twoFactor, { api });
		const state = await authenticateMfa(MOCK_TOTP_CODE, { api });
		expect(state).toEqual({ status: 'signed_in', email: TWO_FACTOR_EMAIL });
		expect(session.isSignedIn).toBe(true);
	});

	it('signs in with a recovery code', async () => {
		await login(twoFactor, { api });
		await authenticateMfa(MOCK_RECOVERY_CODES[0], { api });
		expect(session.isSignedIn).toBe(true);
	});

	it('keeps the code step after a wrong code, with the error on the code field', async () => {
		await login(twoFactor, { api });
		const error = await failure(authenticateMfa('000000', { api }));
		expect(error.kind).toBe('validation');
		expect(error.fields.code).toEqual(['Incorrect code.']);
		expect(session.status).toBe('pending_mfa');
	});

	it('reads the code step again after a reload', async () => {
		await login(twoFactor, { api });
		session.reset();
		resetBootstrap();
		await bootstrap({ api });
		expect(session.status).toBe('pending_mfa');
	});

	it('ends the pending stage on Start over', async () => {
		await login(twoFactor, { api });
		await cancelMfa({ api });
		expect(session.status).toBe('signed_out');
		resetBootstrap();
		await bootstrap({ api });
		expect(session.status).toBe('signed_out');
	});

	it('keeps guarded pages closed at the code step, and the sign-in page open', async () => {
		await login(twoFactor, { api });
		expect(redirectFor({ pathname: '/profile', search: '' }, session.isSignedIn)).toBe(
			'/account/login?next=%2Fprofile'
		);
		expect(redirectFor({ pathname: '/account/login', search: '' }, session.isSignedIn)).toBeNull();
	});
});

describe('reauthentication calls', () => {
	it('accepts the password and refuses a wrong one on its field', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		const error = await failure(reauthenticate('not-the-password', { api }));
		expect(error.fields.password).toBeDefined();
		await reauthenticate(MOCK_PASSWORD, { api });
		expect(mockStore.recentlyReauthenticated()).toBe(true);
	});

	it('accepts a code and refuses a wrong one on its field', async () => {
		await login({ email: TWO_FACTOR_EMAIL, password: MOCK_PASSWORD }, { api });
		await authenticateMfa(MOCK_TOTP_CODE, { api });
		const error = await failure(reauthenticateMfa('000000', { api }));
		expect(error.fields.code).toBeDefined();
		await reauthenticateMfa(MOCK_TOTP_CODE, { api });
		expect(mockStore.recentlyReauthenticated()).toBe(true);
	});
});

describe('account state after sign-in', () => {
	it('is unknown before it loads', () => {
		session.apply({ status: 'signed_in', email: VERIFIED_EMAIL });
		expect(session.organizers).toBeNull();
		expect(session.isOrganizer).toBe(false);
		expect(session.mfaEnrolled).toBeNull();
	});

	it('reads the memberships and two-factor after a sign-in', async () => {
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		await settled();
		expect(session.organizers).toHaveLength(1);
		expect(session.isOrganizer).toBe(true);
		expect(session.mfaEnrolled).toBe(false);
	});

	it('loads by itself after a sign-in, without being asked', async () => {
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		await vi.waitFor(() => expect(session.isOrganizer).toBe(true));
	});

	it('reads two-factor on for an account with TOTP', async () => {
		await login({ email: TWO_FACTOR_EMAIL, password: MOCK_PASSWORD }, { api });
		await authenticateMfa(MOCK_TOTP_CODE, { api });
		await settled();
		expect(session.mfaEnrolled).toBe(true);
		expect(session.isOrganizer).toBe(false);
	});

	it('loads after the session check on startup too', async () => {
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		session.reset();
		resetBootstrap();
		await bootstrap({ api });
		await vi.waitFor(() => expect(session.isOrganizer).toBe(true));
	});

	it('treats a failed call as a non-member with two-factor unknown, and does not throw', async () => {
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		server.use(
			http.get(`${BASE}/api/v1/organizer/organizers`, () => HttpResponse.error()),
			http.get(`${BASE}/_allauth/browser/v1/account/authenticators`, () =>
				HttpResponse.json({ status: 500 }, { status: 500 })
			)
		);
		await settled();
		expect(session.organizers).toEqual([]);
		expect(session.isOrganizer).toBe(false);
		expect(session.mfaEnrolled).toBeNull();
	});

	it('is cleared on sign out and on expiry', async () => {
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		await settled();
		await logout({ api });
		expect(session.organizers).toBeNull();
		expect(session.mfaEnrolled).toBeNull();
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		await settled();
		session.expire();
		expect(session.organizers).toBeNull();
		expect(session.isOrganizer).toBe(false);
	});

	it('drops an answer that comes back after the player signed out', async () => {
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		const loading = loadAccountState({ api });
		session.apply({ status: 'signed_out' });
		await loading;
		expect(session.organizers).toBeNull();
	});
});

describe('watchMfaRequired', () => {
	it('says two-factor needs setting up for an account that must have it and has none', async () => {
		await login({ email: MFA_REQUIRED_EMAIL, password: MOCK_PASSWORD }, { api });
		await settled();
		const heard: boolean[] = [];
		const stop = watchMfaRequired((enrolled) => heard.push(enrolled), { api });
		await api.open.GET('/api/v1/accounts/me');
		stop();
		await api.open.GET('/api/v1/accounts/me');
		expect(heard).toEqual([false]);
	});

	it('says to confirm with a code for an account with TOTP whose session did not pass it', async () => {
		await login({ email: TWO_FACTOR_EMAIL, password: MOCK_PASSWORD }, { api });
		await authenticateMfa(MOCK_TOTP_CODE, { api });
		await settled();
		const current = mockStore.state.session;
		if (current) current.mfaAt = null;
		const heard: boolean[] = [];
		const stop = watchMfaRequired((enrolled) => heard.push(enrolled), { api });
		await api.open.GET('/api/v1/accounts/me');
		stop();
		expect(heard).toEqual([true]);
	});

	it('says nothing for any other answer', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
		const heard: boolean[] = [];
		const stop = watchMfaRequired((enrolled) => heard.push(enrolled), { api });
		await api.open.GET('/api/v1/accounts/me');
		stop();
		expect(heard).toEqual([]);
	});
});
