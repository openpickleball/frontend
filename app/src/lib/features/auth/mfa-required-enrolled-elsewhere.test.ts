/**
 * Review finding F (frontend#261): the `mfa_required` notice trusted the cached
 * `session.mfaEnrolled`. An account that turned two-factor on from another device after this tab
 * loaded (the main way a password-only session meets an account with TOTP), or whose read failed,
 * was told to set two-factor up instead of being offered the code.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, type Api } from '#lib/api/index.js';
import { MOCK_PASSWORD, ORGANIZER_EMAIL } from '#lib/mocks/fixtures.js';
import { useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { loadAccountState, login, resetBootstrap, watchMfaRequired } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';
let api: Api;

beforeEach(() => {
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
	api = createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies });
	resetBootstrap();
	session.reset();
});

afterEach(() => session.reset());

async function enrolledElsewhere(cached: boolean | null): Promise<boolean[]> {
	await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
	await loadAccountState({ api });
	session.mfaEnrolled = cached;
	// Turned on from another device: this session has not passed it.
	const account = mockStore.accountByEmail(ORGANIZER_EMAIL);
	if (account) account.totp = { secret: 'MOCKSECRET', createdAt: 0 };
	const heard: boolean[] = [];
	const stop = watchMfaRequired((enrolled) => heard.push(enrolled), { api });
	await api.open.GET('/api/v1/accounts/me');
	await expect.poll(() => heard.length).toBe(1);
	stop();
	return heard;
}

describe('the mfa_required notice for an account that enrolled elsewhere', () => {
	it('offers the code when the cached value says off', async () => {
		expect(await enrolledElsewhere(false)).toEqual([true]);
		expect(session.mfaEnrolled).toBe(true);
	});

	it('offers the code when the cached value is unknown', async () => {
		expect(await enrolledElsewhere(null)).toEqual([true]);
		expect(session.mfaEnrolled).toBe(true);
	});
});
