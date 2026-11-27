/**
 * Deleting the account when its answer is unclear (plan `delete-account`, criteria 4 and 5): a
 * 401 on the DELETE itself, a lost answer after a raced 401 already signed this device out, and a
 * proxy's 502 or 504 after the backend committed. Each may mean the account is gone, so the
 * device ends it as `maybe` deleted with the email read before sending, and the offline queue of
 * that account goes too.
 */
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAppError, type AppError } from '#lib/api/index.js';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { cookieJarApi, server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { session } from './session.svelte';
import {
	deleteAccount,
	login,
	onSignOut,
	reauthenticate,
	resetBootstrap,
	watchSessionExpiry
} from './services';

useMockApi();

const BASE = 'http://localhost';
const ME = `${BASE}/api/v1/accounts/me`;
const SESSION = `${BASE}/_allauth/browser/v1/auth/session`;

let api: ReturnType<typeof cookieJarApi>;
let heard: (string | null)[];
let expiredCalls: number;
let stops: (() => void)[];

beforeEach(async () => {
	api = cookieJarApi();
	resetBootstrap();
	session.reset();
	heard = [];
	expiredCalls = 0;
	stops = [
		onSignOut((email) => heard.push(email)),
		watchSessionExpiry(() => void expiredCalls++, { api })
	];
	await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
	await reauthenticate(MOCK_PASSWORD, { api });
	heard = [];
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

/** What a proxy in front of the backend sends: an HTML page, not JSON. */
const proxyPage = (status: number) =>
	new HttpResponse(`<html><body>${status}</body></html>`, {
		status,
		headers: { 'Content-Type': 'text/html' }
	});

describe('deleteAccount when the answer is unclear', () => {
	it('ends the account as maybe deleted when a second try gets a 401', async () => {
		// The first try times out before the backend commits, and the check still says signed in.
		server.use(http.delete(ME, () => HttpResponse.error(), { once: true }));
		const first = await failure(deleteAccount({ api }));
		expect(first.kind).toBe('network');
		expect(session.isSignedIn).toBe(true);

		// Then the slow backend deletes the account and ends its sessions. The player tries again.
		mockStore.deleteAccount(VERIFIED_EMAIL);
		await expect(deleteAccount({ api })).resolves.toBe('maybe');

		expect(expiredCalls).toBe(1);
		expect(heard).toEqual([VERIFIED_EMAIL]);
		expect(session.isSignedIn).toBe(false);
		expect(session.accountDeleted).toBe('maybe');
		expect(session.expired).toBe(false);
	});

	it('ends the account as maybe deleted when a raced 401 signed out first and no answer came', async () => {
		server.use(
			http.delete(ME, async () => {
				mockStore.deleteAccount(VERIFIED_EMAIL);
				// A request that raced the delete gets its 401 and expires the session here.
				const raced = await api.open.GET('/api/v1/accounts/me');
				expect(raced.response.status).toBe(401);
				return HttpResponse.error();
			}),
			// The device is already known to be signed out, so the check is not needed.
			http.get(SESSION, () => HttpResponse.json({ status: 500 }, { status: 500 }))
		);
		await expect(deleteAccount({ api })).resolves.toBe('maybe');

		expect(heard).toEqual([VERIFIED_EMAIL]);
		expect(session.isSignedIn).toBe(false);
		expect(session.accountDeleted).toBe('maybe');
		expect(session.expired).toBe(false);
	});

	it.each([502, 504])(
		'ends the account as maybe deleted on a %i after the backend committed',
		async (status) => {
			server.use(
				http.delete(ME, () => {
					mockStore.deleteAccount(VERIFIED_EMAIL);
					return proxyPage(status);
				})
			);
			await expect(deleteAccount({ api })).resolves.toBe('maybe');

			expect(heard).toEqual([VERIFIED_EMAIL]);
			expect(session.isSignedIn).toBe(false);
			expect(session.accountDeleted).toBe('maybe');
			expect(session.expired).toBe(false);
		}
	);

	it('throws the server error when a 502 comes while still signed in', async () => {
		server.use(http.delete(ME, () => proxyPage(502)));
		const error = await failure(deleteAccount({ api }));

		expect(error.kind).toBe('server');
		expect(error.status).toBe(502);
		expect(heard).toEqual([]);
		expect(session.isSignedIn).toBe(true);
		expect(session.accountDeleted).toBeNull();
	});
});
