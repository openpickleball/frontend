/**
 * Review finding T3 (frontend#261): the `mfa_required` notice read two-factor again, then wrote
 * the answer and notified without checking it was still the same account. When A signed out and
 * B signed in during the read, A's answer landed on B.
 */
import { HttpResponse, delay, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { watchMfaRequired } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';

afterEach(() => session.reset());

describe('watchMfaRequired when the account changes during its read', () => {
	it("drops the first account's answer and its notice", async () => {
		server.use(
			http.get(`${BASE}/api/v1/accounts/me`, () =>
				HttpResponse.json({ code: 'mfa_required', message: 'x', errors: [] }, { status: 403 })
			),
			http.get(`${BASE}/_allauth/browser/v1/account/authenticators`, async () => {
				await delay(50);
				return HttpResponse.json({
					status: 200,
					data: [{ type: 'totp', created_at: 1, last_used_at: null }]
				});
			})
		);
		const api = createApi({ baseUrl: BASE });
		session.apply({ status: 'signed_in', email: 'first@example.com' });
		session.mfaEnrolled = false;
		const heard: boolean[] = [];
		const stop = watchMfaRequired((enrolled) => heard.push(enrolled), { api });
		await api.open.GET('/api/v1/accounts/me');
		session.apply({ status: 'signed_out' });
		session.apply({ status: 'signed_in', email: 'second@example.com' });
		const revision = session.mfaRevision;
		await delay(150);
		stop();
		expect(heard).toEqual([]);
		expect(session.mfaEnrolled).toBeNull();
		expect(session.mfaRevision).toBe(revision);
	});
});
