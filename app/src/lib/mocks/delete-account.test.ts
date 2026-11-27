/**
 * The mock of `DELETE /api/v1/accounts/me` (plan `delete-account`, criterion 7): the backend's
 * check order, then the delete itself.
 */
import { describe, expect, it } from 'vitest';
import { allauthParams, type Api } from '../api';
import {
	MFA_REQUIRED_EMAIL,
	MOCK_PASSWORD,
	MOCK_TOTP_CODE,
	STAFF_EMAIL,
	VERIFIED_EMAIL
} from './fixtures';
import { cookieJarApi, useMockApi } from './node';
import { DELETE_ACCOUNT_ATTEMPTS, mockStore } from './store';

useMockApi();

async function login(api: Api, email: string, code?: string): Promise<void> {
	await api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email, password: MOCK_PASSWORD }
	});
	if (code) {
		await api.allauth.POST('/_allauth/{client}/v1/auth/2fa/authenticate', {
			params: allauthParams,
			body: { code }
		});
	}
}

const reauthenticate = (api: Api) =>
	api.allauth.POST('/_allauth/{client}/v1/auth/reauthenticate', {
		params: allauthParams,
		body: { password: MOCK_PASSWORD }
	});

async function reauthenticateWithCode(api: Api) {
	return api.allauth.POST('/_allauth/{client}/v1/auth/2fa/reauthenticate', {
		params: allauthParams,
		body: { code: MOCK_TOTP_CODE }
	});
}

describe('DELETE /api/v1/accounts/me', () => {
	it('is a 401 when nobody is signed in', async () => {
		const api = cookieJarApi();
		const result = await api.open.DELETE('/api/v1/accounts/me');
		expect(result.response.status).toBe(401);
	});

	it('is a 403 reauthentication_required without a recent reauthentication', async () => {
		const api = cookieJarApi();
		await login(api, VERIFIED_EMAIL);
		const result = await api.open.DELETE('/api/v1/accounts/me');
		expect(result.response.status).toBe(403);
		expect(result.error).toMatchObject({ code: 'reauthentication_required' });
		expect(mockStore.accountByEmail(VERIFIED_EMAIL)).toBeDefined();
	});

	it('is a 403 mfa_required for an account that must have two-factor and has none', async () => {
		const api = cookieJarApi();
		await login(api, MFA_REQUIRED_EMAIL);
		const result = await api.open.DELETE('/api/v1/accounts/me');
		expect(result.response.status).toBe(403);
		expect(result.error).toMatchObject({ code: 'mfa_required' });
	});

	it('is a 409 conflict for a staff account, after two-factor and a reauthentication', async () => {
		const api = cookieJarApi();
		await login(api, STAFF_EMAIL, MOCK_TOTP_CODE);
		await reauthenticateWithCode(api);
		const result = await api.open.DELETE('/api/v1/accounts/me');
		expect(result.response.status).toBe(409);
		expect(result.error).toMatchObject({
			code: 'conflict',
			message: 'A staff account cannot be deleted here.'
		});
		expect(mockStore.accountByEmail(STAFF_EMAIL)).toBeDefined();
	});

	it('is a 429 throttled past the attempt limit, refused attempts included', async () => {
		const api = cookieJarApi();
		await login(api, VERIFIED_EMAIL);
		for (let i = 0; i < DELETE_ACCOUNT_ATTEMPTS; i += 1) {
			const refused = await api.open.DELETE('/api/v1/accounts/me');
			expect(refused.response.status).toBe(403);
		}
		await reauthenticate(api);
		const result = await api.open.DELETE('/api/v1/accounts/me');
		expect(result.response.status).toBe(429);
		expect(result.error).toMatchObject({ code: 'throttled' });
		expect(mockStore.accountByEmail(VERIFIED_EMAIL)).toBeDefined();
	});

	it('is a 204 after a reauthentication, and the account and its session are gone', async () => {
		const api = cookieJarApi();
		await login(api, VERIFIED_EMAIL);
		await reauthenticate(api);
		const result = await api.open.DELETE('/api/v1/accounts/me');
		expect(result.response.status).toBe(204);

		expect((await api.open.GET('/api/v1/accounts/me')).response.status).toBe(401);
		expect(mockStore.accountByEmail(VERIFIED_EMAIL)).toBeUndefined();

		// The old password signs nobody in, and the same address can sign up again.
		const again = cookieJarApi();
		await login(again, VERIFIED_EMAIL);
		expect((await again.open.GET('/api/v1/accounts/me')).response.status).toBe(401);
		mockStore.signup(VERIFIED_EMAIL, 'another-long-pass-9876');
		expect(mockStore.accountByEmail(VERIFIED_EMAIL)?.verified).toBe(false);
		expect(mockStore.playerOfAccount(VERIFIED_EMAIL)).toBeUndefined();
	});

	it('leaves its player in place, shown as a private player', async () => {
		const player = mockStore.playerOfAccount(VERIFIED_EMAIL);
		const api = cookieJarApi();
		await login(api, VERIFIED_EMAIL);
		await reauthenticate(api);
		await api.open.DELETE('/api/v1/accounts/me');
		expect(mockStore.playerByCode(player?.code ?? '')).toBeDefined();
		expect(mockStore.isListed(player as NonNullable<typeof player>)).toBe(false);
	});
});
