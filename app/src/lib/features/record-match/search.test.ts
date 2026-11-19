import { describe, expect, it } from 'vitest';
import { allauthParams, createApi, type Api } from '#lib/api/index.js';
import { MOCK_PASSWORD, PLAYERS, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { createSearchHandlers } from '#lib/mocks/handlers/search.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { mockStore } from '#lib/mocks/store.js';
import { parseRetryAfter, searchPlayers, waitText } from './search';

useMockApi();

const BASE = 'http://localhost';
const codeOf = (key: string) => PLAYERS.find((p) => p.key === key)!.code;

/** The real client with a cookie jar, signed in as the mock player. */
async function signedIn(email = VERIFIED_EMAIL): Promise<Api> {
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
	const api = createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies });
	await api.initCsrf();
	await api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email, password: MOCK_PASSWORD }
	});
	return api;
}

describe('searchPlayers', () => {
	it('finds players by the start of a word, in any case, with parsed codes', async () => {
		const api = await signedIn();
		const result = await searchPlayers('  ASH ', { api });
		expect(result).toEqual({
			ok: true,
			items: [{ code: codeOf('kit'), name: 'Kit Ashdown' }]
		});
	});

	it('answers with an empty list when nobody matches', async () => {
		const api = await signedIn();
		expect(await searchPlayers('zzzz', { api })).toEqual({ ok: true, items: [] });
	});

	it('does not leave the browser for text under 3 characters', async () => {
		expect(await searchPlayers('ab')).toEqual({ ok: false, kind: 'invalid', retryAfter: null });
	});

	it('does not list a player whose account is inactive', async () => {
		const api = await signedIn();
		expect(await searchPlayers('saul', { api })).toEqual({ ok: true, items: [] });
	});

	it('reports a 429 with the wait from Retry-After', async () => {
		const api = await signedIn();
		server.use(...createSearchHandlers(mockStore, { perMinute: 1, now: () => 0 }));
		expect((await searchPlayers('bea', { api })).ok).toBe(true);
		const second = await searchPlayers('bea', { api });
		expect(second).toEqual({ ok: false, kind: 'throttled', retryAfter: 60 });
	});

	it('counts searches for each account on its own', async () => {
		server.use(...createSearchHandlers(mockStore, { perMinute: 1, now: () => 0 }));
		const tamsin = await signedIn();
		expect((await searchPlayers('bea', { api: tamsin })).ok).toBe(true);
		expect(await searchPlayers('bea', { api: tamsin })).toMatchObject({ kind: 'throttled' });
		mockStore.logout();
		const kit = await signedIn('kit@example.com');
		expect((await searchPlayers('bea', { api: kit })).ok).toBe(true);
	});

	it('reports a signed-out search as a plain failure', async () => {
		const api = createApi({ baseUrl: BASE });
		expect(await searchPlayers('bea', { api })).toEqual({
			ok: false,
			kind: 'other',
			retryAfter: null
		});
	});

	it('reports a lost connection as offline', async () => {
		const api = createApi({
			baseUrl: BASE,
			fetch: () => Promise.reject(new TypeError('Failed to fetch'))
		});
		expect(await searchPlayers('bea', { api })).toMatchObject({ ok: false, kind: 'offline' });
	});

	it('throws when the search was cancelled', async () => {
		const api = await signedIn();
		const controller = new AbortController();
		const pending = searchPlayers('bea', { api, signal: controller.signal });
		controller.abort();
		await expect(pending).rejects.toBeDefined();
	});
});

describe('the search mock', () => {
	it('puts names that start with the text first, then the rest by name', async () => {
		const api = await signedIn();
		const base = mockStore.state.players[0];
		for (const displayName of ['Ann-Marlowe Reed', 'Marlon Ide']) {
			mockStore.state.players.push({ ...base, code: codeOf('rosa'), displayName });
		}
		const result = await api.open.GET('/api/v1/players/search', {
			params: { query: { q: 'marl' } }
		});
		expect(result.data?.items.map((i) => i.display_name)).toEqual([
			'Marlon Ide',
			'Ann-Marlowe Reed',
			'Bea Marlowe'
		]);
	});

	it('honors limit', async () => {
		const api = await signedIn();
		const base = mockStore.state.players[0];
		for (const name of ['Brigid Hale', 'Brin Ashby']) {
			mockStore.state.players.push({ ...base, code: codeOf('rosa'), displayName: name });
		}
		const all = await api.open.GET('/api/v1/players/search', { params: { query: { q: 'bri' } } });
		expect(all.data?.items.map((i) => i.display_name)).toEqual([
			'Brigid Hale',
			'Brin Ashby',
			'Nell Brightwater'
		]);
		const one = await api.open.GET('/api/v1/players/search', {
			params: { query: { q: 'bri', limit: 1 } }
		});
		expect(one.data?.items.map((i) => i.display_name)).toEqual(['Brigid Hale']);
	});

	it('refuses a bad q or limit with a 422 that does not repeat the text', async () => {
		const api = await signedIn();
		for (const query of [
			{ q: 'ab' },
			{ q: 'x'.repeat(65) },
			{ q: 'bea', limit: 21 },
			{ q: 'bea', limit: 0 }
		]) {
			const result = await api.open.GET('/api/v1/players/search', { params: { query } });
			expect(result.response.status).toBe(422);
			expect(JSON.stringify(result.error)).not.toContain('xxxx');
		}
		const control = await api.open.GET('/api/v1/players/search', {
			params: { query: { q: 'be\u0007a' } }
		});
		expect(control.response.status).toBe(422);
		expect(JSON.stringify(control.error)).not.toContain('be');
	});

	it('is for signed-in accounts only', async () => {
		const api = createApi({ baseUrl: BASE });
		const result = await api.open.GET('/api/v1/players/search', {
			params: { query: { q: 'bea' } }
		});
		expect(result.response.status).toBe(401);
	});
});

describe('helpers', () => {
	it('reads Retry-After as whole seconds only', () => {
		expect(parseRetryAfter('59')).toBe(59);
		expect(parseRetryAfter(null)).toBeNull();
		expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
	});

	it('words a wait', () => {
		expect(waitText(null)).toBe('in a minute');
		expect(waitText(1)).toBe('in 1 second');
		expect(waitText(30)).toBe('in 30 seconds');
		expect(waitText(59)).toBe('in a minute');
		expect(waitText(300)).toBe('in 5 minutes');
		expect(waitText(7200)).toBe('in 2 hours');
	});
});
