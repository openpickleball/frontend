/**
 * Review finding Q (frontend#261): the backend checks CSRF before `mfa_required` on an unsafe
 * request (`config/auth.py`). The mock answered `mfa_required` first.
 */
import { describe, expect, it } from 'vitest';
import { MFA_REQUIRED_EMAIL, MOCK_PASSWORD } from './fixtures';
import { useMockApi } from './node';
import { mockStore } from './store';

useMockApi();

describe('the mfa_required gate and CSRF', () => {
	it('answers a POST with no CSRF token with the CSRF failure, not mfa_required', async () => {
		expect(mockStore.login(MFA_REQUIRED_EMAIL, MOCK_PASSWORD)).toBe('ok');
		const response = await fetch('http://localhost/api/v1/matches/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			code: 'forbidden',
			message: 'CSRF check Failed'
		});
	});

	it('still answers mfa_required to a POST with a valid token', async () => {
		mockStore.login(MFA_REQUIRED_EMAIL, MOCK_PASSWORD);
		const response = await fetch('http://localhost/api/v1/matches/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': mockStore.state.csrfToken },
			body: '{}'
		});
		expect(await response.json()).toMatchObject({ code: 'mfa_required' });
	});
});
