/**
 * Deleting the account when its answer never arrives (plan `delete-account`, criteria 4 to 6). A
 * timeout or a dropped connection is a `network` error, but the backend may have deleted the
 * account anyway. The service asks allauth once whether this device is still signed in.
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
let stops: (() => void)[];

beforeEach(async () => {
	api = cookieJarApi();
	resetBootstrap();
	session.reset();
	heard = [];
	stops = [onSignOut((email) => heard.push(email)), watchSessionExpiry(() => {}, { api })];
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

describe('deleteAccount when the answer is lost', () => {
	it('says deleted on a 204', async () => {
		await expect(deleteAccount({ api })).resolves.toBe('deleted');
		expect(session.accountDeleted).toBe('deleted');
	});

	it('ends the account as maybe deleted when the session check says signed out', async () => {
		// The backend deleted the account and ended its sessions, then the connection dropped.
		server.use(
			http.delete(ME, () => {
				mockStore.deleteAccount(VERIFIED_EMAIL);
				return HttpResponse.error();
			})
		);
		await expect(deleteAccount({ api })).resolves.toBe('maybe');
		expect(heard).toEqual([VERIFIED_EMAIL]);
		expect(session.isSignedIn).toBe(false);
		expect(session.accountDeleted).toBe('maybe');
		expect(session.expired).toBe(false);
	});

	it('throws the network error when the session check says still signed in', async () => {
		server.use(http.delete(ME, () => HttpResponse.error()));
		const error = await failure(deleteAccount({ api }));
		expect(error.kind).toBe('network');
		expect(heard).toEqual([]);
		expect(session.isSignedIn).toBe(true);
		expect(session.accountDeleted).toBeNull();
	});

	it('throws the original network error when the session check fails too', async () => {
		server.use(
			http.delete(ME, () => HttpResponse.error()),
			http.get(SESSION, () => HttpResponse.json({ status: 500 }, { status: 500 }))
		);
		const error = await failure(deleteAccount({ api }));
		expect(error.kind).toBe('network');
		expect(heard).toEqual([]);
		expect(session.isSignedIn).toBe(true);
		expect(session.accountDeleted).toBeNull();
	});
});

describe('session.markDeleted', () => {
	it('keeps which notice to show, and clears expired', () => {
		session.apply({ status: 'signed_in', email: VERIFIED_EMAIL });
		session.expire();
		session.markDeleted('maybe');
		expect(session.accountDeleted).toBe('maybe');
		expect(session.expired).toBe(false);
		session.markDeleted('deleted');
		expect(session.accountDeleted).toBe('deleted');
	});

	it('is cleared by apply and by reset', () => {
		session.markDeleted('maybe');
		session.apply({ status: 'signed_out' });
		expect(session.accountDeleted).toBeNull();
		session.markDeleted('maybe');
		session.reset();
		expect(session.accountDeleted).toBeNull();
	});
});
