/**
 * Deleting the account when another OPEN request gets its 401 first (plan `delete-account`,
 * criterion 5). The backend has deleted the account and ended its sessions, a request that raced
 * the delete answers 401 and expires the session, and only then is the 204 handled. The cleanup
 * must still hear the deleted account's email, or its offline queue stays on the device.
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApi, type Api } from '#lib/api/index.js';
import { MOCK_PASSWORD, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { useMockApi } from '#lib/mocks/node.js';
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

/**
 * The real client against the mocks, with a cookie jar. `beforeDeleteAnswer` runs after the
 * backend answered the DELETE and before the client hands that answer on.
 */
function racingApi(beforeDeleteAnswer: () => Promise<void>): Api {
	const jar = new Map<string, string>();
	const fetchWithJar: typeof fetch = async (input, init) => {
		const response = await fetch(input, init);
		for (const line of response.headers.getSetCookie()) {
			const [pair] = line.split(';');
			const [name, ...value] = pair.split('=');
			jar.set(name.trim(), value.join('='));
		}
		const method = input instanceof Request ? input.method : (init?.method ?? 'GET');
		const url = input instanceof Request ? input.url : String(input);
		if (method === 'DELETE' && url.endsWith('/api/v1/accounts/me')) await beforeDeleteAnswer();
		return response;
	};
	const getCookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	return createApi({ baseUrl: 'http://localhost', fetch: fetchWithJar, getCookies });
}

beforeEach(() => {
	resetBootstrap();
	session.reset();
});

afterEach(() => {
	session.reset();
});

it('gives the cleanup the deleted account email when a 401 expired the session first', async () => {
	let expiredFirst = false;
	const api: Api = racingApi(async () => {
		const raced = await api.open.GET('/api/v1/accounts/me');
		expect(raced.response.status).toBe(401);
		expiredFirst = session.expired;
	});
	const stopWatching = watchSessionExpiry(() => {}, { api });
	await login({ email: VERIFIED_EMAIL, password: MOCK_PASSWORD }, { api });
	await reauthenticate(MOCK_PASSWORD, { api });

	const heard: (string | null)[] = [];
	const stopListening = onSignOut((email) => heard.push(email));
	await deleteAccount({ api });
	stopListening();
	stopWatching();

	expect(expiredFirst).toBe(true);
	expect(heard).toEqual([VERIFIED_EMAIL]);
	expect(session.isSignedIn).toBe(false);
	expect(session.accountDeleted).toBeTruthy();
	expect(session.expired).toBe(false);
});
