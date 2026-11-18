import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, isAppError, type AppError } from '#lib/api/index.js';
import { MOCK_KEYS, MOCK_PASSWORD, UNVERIFIED_EMAIL, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { isThrottled } from './forms';
import { session } from './session.svelte';
import {
	bootstrap,
	checkResetKey,
	configureAuthApi,
	login,
	logout,
	requestPasswordReset,
	resetBootstrap,
	resetPassword,
	signup,
	verifyEmail
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

beforeEach(() => {
	configureAuthApi(browserApi());
	resetBootstrap();
	session.reset();
});

afterEach(() => configureAuthApi());

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
		await bootstrap();
		expect(session.status).toBe('signed_out');
	});

	it('reads a signed-in session', async () => {
		await bootstrap();
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD });
		session.reset();
		resetBootstrap();
		await bootstrap();
		expect(session.status).toBe('signed_in');
		expect(session.email).toBe(VERIFIED_EMAIL);
	});

	it('reads a pending verification from the 401 flows, not as an error', async () => {
		await signup({ email: 'new.player@example.com', password: 'a-long-enough-pass' });
		session.reset();
		resetBootstrap();
		await bootstrap();
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
		await bootstrap();
		expect(session.status).toBe('unknown');
		server.resetHandlers();
		await bootstrap();
		expect(calls).toBe(1);
		expect(session.status).toBe('signed_out');
		await bootstrap();
		expect(session.status).toBe('signed_out');
	});
});

describe('login', () => {
	it('signs in a verified account', async () => {
		const state = await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD });
		expect(state).toEqual({ status: 'signed_in', email: VERIFIED_EMAIL });
		expect(session.isSignedIn).toBe(true);
		expect(session.email).toBe(VERIFIED_EMAIL);
	});

	it('rejects a wrong password with the mismatch code and stays signed out', async () => {
		const error = await failure(login({ email: VERIFIED_EMAIL, password: 'not-the-password' }));
		expect(error.code).toBe('email_password_mismatch');
		expect(session.isSignedIn).toBe(false);
	});

	it('answers an unverified account with pending verification, and a new link', async () => {
		const state = await login({ email: UNVERIFIED_EMAIL, password: MOCK_PASSWORD });
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
		const error = await failure(login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }));
		expect(error.code).toBe('throttled');
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
		const error = await failure(login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }));
		expect(isThrottled(error)).toBe(true);
		expect(error.message).toBe('Too many failed login attempts.');
	});

	it('reports a network failure', async () => {
		server.use(http.post(`${AUTH}/login`, () => HttpResponse.error()));
		const error = await failure(login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }));
		expect(error.kind).toBe('network');
	});
});

describe('signup', () => {
	it('answers a new address with pending verification and mails a link', async () => {
		const state = await signup({ email: 'new.player@example.com', password: 'a-long-enough-pass' });
		expect(state).toEqual({ status: 'pending_verification' });
		expect(session.email).toBe('new.player@example.com');
		expect(lastMail()).toMatchObject({ kind: 'verify_email', to: 'new.player@example.com' });
	});

	it('answers an address that already has an account exactly the same way', async () => {
		const fresh = await signup({ email: 'new.player@example.com', password: 'a-long-enough-pass' });
		const freshSession = { status: session.status };
		session.reset();
		const existing = await signup({ email: VERIFIED_EMAIL, password: 'a-long-enough-pass' });
		expect(existing).toEqual(fresh);
		expect({ status: session.status }).toEqual(freshSession);
		expect(lastMail()?.kind).toBe('account_exists');
	});

	it('maps a weak password onto its field', async () => {
		const error = await failure(signup({ email: 'new.player@example.com', password: 'password' }));
		expect(error.kind).toBe('validation');
		expect(error.fields.password?.length).toBeGreaterThan(0);
		expect(session.status).not.toBe('pending_verification');
	});
});

describe('verifyEmail', () => {
	it('confirms the address and does not sign the player in', async () => {
		await verifyEmail(MOCK_KEYS.verifyEmail);
		expect(session.isSignedIn).toBe(false);
		const state = await login({ email: UNVERIFIED_EMAIL, password: MOCK_PASSWORD });
		expect(state.status).toBe('signed_in');
	});

	it('works with the key from a sign-up email, then the player can sign in', async () => {
		await signup({ email: 'new.player@example.com', password: 'a-long-enough-pass' });
		const key = lastMail()?.key as string;
		await verifyEmail(key);
		// The pending state is cleared once the address is confirmed.
		expect(session.status).toBe('signed_out');
		const state = await login({ email: 'new.player@example.com', password: 'a-long-enough-pass' });
		expect(state.status).toBe('signed_in');
	});

	it('rejects an unknown or used key', async () => {
		const unknown = await failure(verifyEmail('nope'));
		expect(unknown.status).toBe(400);
		expect(unknown.code).toBe('invalid_or_expired_key');
		await verifyEmail(MOCK_KEYS.verifyEmail);
		// The mock keeps verify keys valid, but a key for no account is refused.
		expect((await failure(verifyEmail('another-bad-key'))).fields.key?.length).toBeGreaterThan(0);
	});
});

describe('logout', () => {
	it('signs the player out', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD });
		await logout();
		expect(session.status).toBe('signed_out');
		expect(session.email).toBeNull();
		resetBootstrap();
		await bootstrap();
		expect(session.isSignedIn).toBe(false);
	});

	it('clears the session on this device even when the call fails', async () => {
		await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD });
		server.use(http.delete(`${AUTH}/session`, () => HttpResponse.error()));
		await expect(logout()).rejects.toMatchObject({ kind: 'network' });
		expect(session.status).toBe('signed_out');
	});
});

describe('password reset', () => {
	it('mails a link for a known address', async () => {
		await requestPasswordReset(VERIFIED_EMAIL);
		expect(lastMail()).toMatchObject({ kind: 'reset_password', to: VERIFIED_EMAIL });
	});

	it('answers an unknown address the same way and sends nothing', async () => {
		const before = mockStore.state.outbox.length;
		await expect(requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
		expect(mockStore.state.outbox).toHaveLength(before);
	});

	it('checks whether a link still works', async () => {
		await expect(checkResetKey(MOCK_KEYS.resetPassword)).resolves.toBe(true);
		await expect(checkResetKey('nope')).resolves.toBe(false);
	});

	it('does not call a good link bad when the network fails', async () => {
		server.use(http.get(`${AUTH}/password/reset`, () => HttpResponse.error()));
		await expect(checkResetKey(MOCK_KEYS.resetPassword)).rejects.toMatchObject({
			kind: 'network'
		});
	});

	it('sets a new password without signing in, and the new one works', async () => {
		await resetPassword(MOCK_KEYS.resetPassword, 'a-brand-new-pass-77');
		expect(session.isSignedIn).toBe(false);
		await expect(
			login({ email: VERIFIED_EMAIL, password: 'a-brand-new-pass-77' })
		).resolves.toMatchObject({ status: 'signed_in' });
	});

	it('refuses a weak password with a field error', async () => {
		const error = await failure(resetPassword(MOCK_KEYS.resetPassword, 'password'));
		expect(error.fields.password?.length).toBeGreaterThan(0);
	});

	it('refuses a bad key with a key error', async () => {
		const error = await failure(resetPassword('nope', 'a-brand-new-pass-77'));
		expect(error.fields.key?.length).toBeGreaterThan(0);
	});
});
