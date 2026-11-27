/**
 * Review finding J (frontend#261): the organizer list is read after a sign-in. When the session
 * had not passed two-factor, that read gets 403 `mfa_required` and counts as no memberships.
 * Nothing read it again once the session passed two-factor (a code reauthentication, or turning
 * TOTP on), so the account stayed a non-member until the next sign-in.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApi, type Api } from '#lib/api/index.js';
import {
	MFA_REQUIRED_EMAIL,
	MOCK_PASSWORD,
	MOCK_TOTP_CODE,
	ORGANIZER_EMAIL
} from '#lib/mocks/fixtures.js';
import { useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import {
	loadAccountState,
	login,
	reauthenticate,
	reauthenticateMfa,
	resetBootstrap
} from './services';
import { session } from './session.svelte';
import { activateTotp } from './two-factor';

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

const membership = () =>
	structuredClone(mockStore.accountByEmail(ORGANIZER_EMAIL)?.organizers ?? []);

describe('the account state after the session passes two-factor', () => {
	it('is read again after a code reauthentication', async () => {
		// An organizer with TOTP whose session has not passed it, as after enrolling elsewhere.
		const account = mockStore.accountByEmail(ORGANIZER_EMAIL);
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		if (account) account.totp = { secret: 'MOCKSECRET', createdAt: 0 };
		await loadAccountState({ api });
		expect(session.organizers).toEqual([]);
		await reauthenticateMfa(MOCK_TOTP_CODE, { api });
		await expect.poll(() => session.organizers?.length).toBe(1);
	});

	it('is read again after turning TOTP on', async () => {
		const account = mockStore.accountByEmail(MFA_REQUIRED_EMAIL);
		if (account) account.organizers = membership();
		await login({ email: MFA_REQUIRED_EMAIL, password: MOCK_PASSWORD }, { api });
		await loadAccountState({ api });
		expect(session.organizers).toEqual([]);
		await reauthenticate(MOCK_PASSWORD, { api });
		await activateTotp(MOCK_TOTP_CODE, { api });
		await expect.poll(() => session.organizers?.length).toBe(1);
	});
});
