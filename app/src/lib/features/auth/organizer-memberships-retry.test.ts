/**
 * Defect F4: a failed memberships read was stored as an empty list, and `organizerMemberships`
 * read again only while the list was unknown. A member whose read failed once got not found at
 * `/organizer` for the rest of the session. A failed read must count as unknown for the next
 * visit, while the nav still treats the account as a non-member.
 */
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi, type Api } from '#lib/api/index.js';
import { LARKSPUR, MOCK_PASSWORD, ORGANIZER_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { organizerMemberships } from './index';
import { resetBootstrap, watchMfaRequired } from './services';
import { session } from './session.svelte';

useMockApi();

const BASE = 'http://localhost';
const URL_ = { pathname: '/organizer', search: '' };

function browserApi(): Api {
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
	return createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies });
}

let api: Api;
let reads = 0;
server.events.on('request:start', ({ request }) => {
	if (new URL(request.url).pathname === '/api/v1/organizer/organizers') reads += 1;
});

beforeEach(() => {
	reads = 0;
	api = browserApi();
	resetBootstrap();
	session.reset();
});

describe('organizerMemberships after a failed read', () => {
	it('reads again on the next visit, and finds the membership once the read works', async () => {
		let fail = true;
		server.use(
			http.get(`${BASE}/api/v1/organizer/organizers`, () =>
				fail ? HttpResponse.error() : undefined
			)
		);
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		expect(await organizerMemberships(URL_, { api })).toEqual([]);
		// Still a non-member for the nav while the read fails.
		expect(session.isOrganizer).toBe(false);
		fail = false;
		const memberships = await organizerMemberships(URL_, { api });
		expect(memberships.map((m) => m.organizer)).toEqual([LARKSPUR]);
		expect(session.isOrganizer).toBe(true);
	});

	it('does not read again after a read that worked and found none', async () => {
		server.use(http.get(`${BASE}/api/v1/organizer/organizers`, () => HttpResponse.json([])));
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		await organizerMemberships(URL_, { api });
		const before = reads;
		expect(await organizerMemberships(URL_, { api })).toEqual([]);
		expect(reads).toBe(before);
	});

	it('tells the mfa_required watcher once per refused read, never more', async () => {
		server.use(
			http.get(`${BASE}/api/v1/organizer/organizers`, () =>
				HttpResponse.json({ code: 'mfa_required', message: 'x', errors: [] }, { status: 403 })
			)
		);
		const told: boolean[] = [];
		const stop = watchMfaRequired((enrolled) => told.push(enrolled), { api });
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		for (let visit = 0; visit < 3; visit++) {
			expect(await organizerMemberships(URL_, { api })).toEqual([]);
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
		stop();
		expect(reads).toBe(3);
		expect(told.length).toBeLessThanOrEqual(reads);
		// The root layout shows each notice as the one toast with id 'mfa-required', so repeated
		// notices replace it instead of stacking (root-layout.svelte.test.ts).
	});
});
