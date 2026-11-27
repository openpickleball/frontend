/**
 * Review finding L (frontend#261): when the login's two-factor stage ran out, `POST
 * auth/2fa/authenticate` answers 401 with no pending `mfa_authenticate` flow (or 409 with no stage
 * at all). The store went signed out, the code step went away with its error, and the player saw
 * the password form with no reason.
 */
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { authenticateMfa } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';
const AUTH = `${BASE}/_allauth/browser/v1/auth`;
const signedOut = () =>
	HttpResponse.json(
		{
			status: 401,
			data: { flows: [{ id: 'login' }, { id: 'signup' }] },
			meta: { is_authenticated: false }
		},
		{ status: 401 }
	);

afterEach(() => session.reset());

describe('authenticateMfa after the two-factor stage ran out', () => {
	it.each([
		['a 401 with no pending stage', () => signedOut()],
		['a 409 with no stage', () => HttpResponse.json({ status: 409 }, { status: 409 })]
	])('signs out with a reason the sign-in page shows, on %s', async (_, answer) => {
		server.use(
			http.post(`${AUTH}/2fa/authenticate`, answer),
			http.get(`${AUTH}/session`, signedOut)
		);
		session.apply({ status: 'pending_mfa', types: ['totp'] });
		await expect(
			authenticateMfa('123456', { api: createApi({ baseUrl: BASE }) })
		).rejects.toThrow();
		expect(session.status).toBe('signed_out');
		expect(session.mfaTimedOut).toBe(true);
	});

	it('forgets the reason once the player signs in again', () => {
		session.apply({ status: 'signed_out' });
		session.mfaTimedOut = true;
		session.apply({ status: 'pending_mfa', types: ['totp'] });
		expect(session.mfaTimedOut).toBe(false);
	});
});
