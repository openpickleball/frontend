/**
 * When the memory of an unclear delete try ends (plan `delete-account`, criteria 4 and 5). A try
 * with an unclear answer makes the next 401 on the DELETE count as `maybe` deleted. That memory
 * must not outlive the session it came from: after a new sign-in with the same email, or once it
 * is older than the time limit, a 401 is a plain expiry again. Then nothing on this device is
 * deleted, so the offline queue of an account that still exists stays.
 */
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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

const ME = 'http://localhost/api/v1/accounts/me';

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
	vi.useRealTimers();
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

/** A plain expiry: the 401 is thrown, nothing is deleted and the watcher's expiry stands. */
async function expectPlainExpiry(): Promise<void> {
	const error = await failure(deleteAccount({ api }));
	expect(error.status).toBe(401);
	expect(heard).toEqual([]);
	expect(session.accountDeleted).toBeNull();
	expect(session.expired).toBe(true);
}

it('treats a 401 as a plain expiry after a new sign-in with the same email', async () => {
	server.use(http.delete(ME, proxyPage, { once: true }));
	const first = await failure(deleteAccount({ api }));
	expect(first.status).toBe(502);
	expect(session.isSignedIn).toBe(true);

	// The session ends on the backend, the device hears it, and the player signs in again.
	mockStore.logout();
	const raced = await api.open.GET('/api/v1/accounts/me');
	expect(raced.response.status).toBe(401);
	expect(session.expired).toBe(true);
	await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
	expect(session.isSignedIn).toBe(true);

	// Later that session ends on the backend too, and the player presses Delete.
	mockStore.logout();
	await expectPlainExpiry();
});

it('treats a 401 as a plain expiry once the unclear try is older than the limit', async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	const start = Date.now();
	server.use(http.delete(ME, () => HttpResponse.error(), { once: true }));
	const first = await failure(deleteAccount({ api }));
	expect(first.kind).toBe('network');
	expect(session.isSignedIn).toBe(true);

	// Eleven minutes later the session has ended on the backend, and the player tries again.
	vi.setSystemTime(start + 11 * 60 * 1000);
	mockStore.logout();
	await expectPlainExpiry();
});
