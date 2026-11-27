/**
 * Review finding I (frontend#261): the account state read wrote `session.mfaEnrolled` when both
 * of its calls answered, over a newer value set meanwhile (by turning TOTP on, or another read).
 */
import { HttpResponse, delay, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { loadAccountState } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';

afterEach(() => session.reset());

describe('loadAccountState and a newer two-factor value', () => {
	it('keeps a value set while the read was in flight', async () => {
		server.use(
			http.get(`${BASE}/api/v1/organizer/organizers`, () => HttpResponse.json([])),
			http.get(`${BASE}/_allauth/browser/v1/account/authenticators`, async () => {
				await delay(50);
				return HttpResponse.json({ status: 200, data: [] });
			})
		);
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		const loading = loadAccountState({ api: createApi({ baseUrl: BASE }) });
		// TOTP was turned on while the read was still waiting for its answer.
		session.mfaEnrolled = true;
		await loading;
		expect(session.mfaEnrolled).toBe(true);
		expect(session.organizers).toEqual([]);
	});
});
