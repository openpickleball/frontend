/**
 * Review finding T4 (frontend#261): the organizer list was written by whichever read answered
 * last. An older read refused with `mfa_required` (so no memberships) that answered after the read
 * started once the session passed two-factor overwrote the real list.
 */
import { HttpResponse, delay, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { loadAccountState } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';
const MEMBERSHIP = {
	organizer: 'G-K7MQ-2RD4',
	name: 'Larkspur Paddle League',
	role: 'admin',
	verified: true
};

afterEach(() => session.reset());

describe('loadAccountState with two reads in flight', () => {
	it('keeps the newest read of the organizer list', async () => {
		let calls = 0;
		server.use(
			http.get(`${BASE}/api/v1/organizer/organizers`, async () => {
				if (++calls === 1) {
					// The first read, before the session passed two-factor: refused, and slow.
					await delay(80);
					return HttpResponse.json(
						{ code: 'mfa_required', message: 'x', errors: [] },
						{ status: 403 }
					);
				}
				return HttpResponse.json([MEMBERSHIP]);
			}),
			http.get(`${BASE}/_allauth/browser/v1/account/authenticators`, () =>
				HttpResponse.json({ status: 200, data: [] })
			)
		);
		const api = createApi({ baseUrl: BASE });
		session.apply({ status: 'signed_in', email: 'organizer@example.com' });
		const older = loadAccountState({ api });
		const newer = loadAccountState({ api });
		await Promise.all([older, newer]);
		expect(session.organizers).toEqual([MEMBERSHIP]);
	});
});
