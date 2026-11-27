/**
 * A race seen in review of the live drive (frontend#261): after a sign-in, the organizer list
 * and the authenticator list are read in parallel. When a 403 `mfa_required` comes back before
 * the authenticator list, two-factor is still unknown, so the notice told an account that has
 * two-factor to set it up, instead of offering the code.
 */
import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { loadAccountState, watchMfaRequired } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';

describe('watchMfaRequired while the account state loads', () => {
	it('waits for two-factor to be known before it says which notice to show', async () => {
		server.use(
			http.get(`${BASE}/api/v1/organizer/organizers`, () =>
				HttpResponse.json(
					{ code: 'mfa_required', message: 'Two-factor required.', errors: [] },
					{ status: 403 }
				)
			),
			http.get(`${BASE}/_allauth/browser/v1/account/authenticators`, async () => {
				await delay(50);
				return HttpResponse.json({
					status: 200,
					data: [{ type: 'totp', created_at: 1795744735, last_used_at: null }]
				});
			})
		);
		const api = createApi({ baseUrl: BASE });
		session.apply({ status: 'signed_in', email: 'twofactor@example.com' });
		const heard: boolean[] = [];
		const stop = watchMfaRequired((enrolled) => heard.push(enrolled), { api });
		await loadAccountState({ api });
		await expect.poll(() => heard).toEqual([true]);
		stop();
		session.reset();
	});
});
