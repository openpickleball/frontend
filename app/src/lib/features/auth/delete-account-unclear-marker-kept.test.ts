/**
 * A refusal between delete tries keeps the memory of an unclear try (plan `delete-account`,
 * criterion 4). A try can time out while the backend is slow, the next try can be refused with a
 * 429 or a 403, and then the slow try commits. The 401 that follows may still mean the account is
 * gone, so it ends the account as `maybe` deleted, and the offline queue of that account goes too.
 */
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { isAppError, type AppError } from '#lib/api/index.js';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { cookieJarApi, server, useMockApi } from '#lib/mocks/node.js';
import { reauthenticationRequiredOpen, throttled } from '#lib/mocks/responses.js';
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

it.each([
	['a 429', 429, throttled],
	['a 403', 403, reauthenticationRequiredOpen]
])(
	'ends the account as maybe deleted on a 401 after %s between tries',
	async (_name, status, refusal) => {
		// The first try times out while the backend is slow, and the device is still signed in.
		server.use(http.delete(ME, () => HttpResponse.error(), { once: true }));
		const first = await failure(deleteAccount({ api }));
		expect(first.kind).toBe('network');
		expect(session.isSignedIn).toBe(true);

		// The second try is refused.
		server.use(http.delete(ME, () => refusal(), { once: true }));
		const second = await failure(deleteAccount({ api }));
		expect(second.status).toBe(status);
		expect(session.isSignedIn).toBe(true);

		// Then the slow first try commits, and the player tries again.
		mockStore.deleteAccount(VERIFIED_EMAIL);
		await expect(deleteAccount({ api })).resolves.toBe('maybe');

		expect(heard).toEqual([VERIFIED_EMAIL]);
		expect(session.isSignedIn).toBe(false);
		expect(session.accountDeleted).toBe('maybe');
		expect(session.expired).toBe(false);
	}
);
