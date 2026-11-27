/**
 * `organizerMemberships` decides whether `/organizer` exists for this account, so it must never
 * answer before the memberships are known. The read starts without being awaited when the
 * account signs in, so a load right after sign-in has to wait for it.
 */
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { createApi, type Api } from '#lib/api/index.js';
import { LARKSPUR, MOCK_PASSWORD, ORGANIZER_EMAIL, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { organizerMemberships } from './index';
import { login, resetBootstrap } from './services';
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

describe('session.isMemberOf', () => {
	it('compares organizer codes in any case, with or without hyphens', () => {
		session.apply({ status: 'signed_in', email: ORGANIZER_EMAIL });
		session.organizers = [
			{
				organizer: LARKSPUR,
				name: 'Larkspur Paddle League',
				role: 'admin',
				verified: true,
				verification_requested: false
			}
		];
		expect(session.isMemberOf(LARKSPUR.toLowerCase().replaceAll('-', ''))).toBe(true);
		expect(session.isMemberOf('G-ZZZZ-ZZZZ')).toBe(false);
	});

	it('is false while the memberships are unknown', () => {
		session.apply({ status: 'signed_in', email: ORGANIZER_EMAIL });
		expect(session.isMemberOf(LARKSPUR)).toBe(false);
	});
});

describe('organizerMemberships', () => {
	it('waits for the read that sign-in started', async () => {
		await login({ email: ORGANIZER_EMAIL, password: MOCK_PASSWORD }, { api });
		// The read is still in flight here.
		expect(session.organizers).toBeNull();
		const memberships = await organizerMemberships(URL_, { api });
		expect(memberships.map((m) => m.organizer)).toEqual([LARKSPUR]);
		expect(reads).toBe(1);
	});

	it('waits for the read that the first session check started, as on a reload', async () => {
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		const memberships = await organizerMemberships(URL_, { api });
		expect(memberships.map((m) => m.organizer)).toEqual([LARKSPUR]);
		expect(reads).toBe(1);
	});

	it('reads the memberships when no read ran', async () => {
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		await organizerMemberships(URL_, { api });
		session.organizers = null;
		const memberships = await organizerMemberships(URL_, { api });
		expect(memberships.map((m) => m.organizer)).toEqual([LARKSPUR]);
	});

	it('is empty for a player who is not a member', async () => {
		mockStore.login(VERIFIED_EMAIL, MOCK_PASSWORD);
		expect(await organizerMemberships(URL_, { api })).toEqual([]);
	});

	it('is empty when the read fails', async () => {
		server.use(http.get(`${BASE}/api/v1/organizer/organizers`, () => HttpResponse.error()));
		mockStore.login(ORGANIZER_EMAIL, MOCK_PASSWORD);
		expect(await organizerMemberships(URL_, { api })).toEqual([]);
	});

	it('sends a signed-out visit to sign in, and back', async () => {
		const thrown = await organizerMemberships(URL_, { api }).catch((e: unknown) => e);
		expect(isRedirect(thrown) && thrown.location).toBe('/account/login?next=%2Forganizer');
	});
});
