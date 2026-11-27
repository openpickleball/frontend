/**
 * Review finding A (frontend#261), the mock half: allauth's `view_recovery_codes` asks for a
 * recent reauthentication before it lists the codes. The mock listed them without one.
 */
import { describe, expect, it } from 'vitest';
import { allauthParams, createApi } from '../api';
import { MOCK_PASSWORD, MOCK_TOTP_CODE, TWO_FACTOR_EMAIL } from './fixtures';
import { useMockApi } from './node';
import { mockStore } from './store';

useMockApi();

const PATH = '/_allauth/{client}/v1/account/authenticators/recovery-codes' as const;

describe('GET recovery-codes', () => {
	it('asks for a recent reauthentication first, then lists the codes', async () => {
		// The mock's CSRF token, as the cookie would carry it in a browser.
		const api = createApi({
			baseUrl: 'http://localhost',
			getCookies: () => `csrftoken=${mockStore.state.csrfToken}`
		});
		await api.allauth.POST('/_allauth/{client}/v1/auth/login', {
			params: allauthParams,
			body: { email: TWO_FACTOR_EMAIL, password: MOCK_PASSWORD }
		});
		await api.allauth.POST('/_allauth/{client}/v1/auth/2fa/authenticate', {
			params: allauthParams,
			body: { code: MOCK_TOTP_CODE }
		});
		const first = await api.allauth.GET(PATH, { params: allauthParams });
		expect(first.response.status).toBe(401);
		const flows = (first.error as { data: { flows: { id: string }[] } }).data.flows;
		expect(flows.map((flow) => flow.id)).toEqual(['reauthenticate', 'mfa_reauthenticate']);
		await api.allauth.POST('/_allauth/{client}/v1/auth/reauthenticate', {
			params: allauthParams,
			body: { password: MOCK_PASSWORD }
		});
		const second = await api.allauth.GET(PATH, { params: allauthParams });
		expect(second.response.status).toBe(200);
	});
});
