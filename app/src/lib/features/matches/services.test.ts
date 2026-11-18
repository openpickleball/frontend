import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allauthParams, createApi, isAppError, type AppError } from '#lib/api/index.js';
import { buildCode, type MatchCode, type PlayerCode } from '#lib/domain/index.js';
import { MATCHES, MOCK_PASSWORD, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { MatchCache } from './cache.svelte.js';
import {
	PAGE_SIZE,
	SCAN_LIMIT,
	configureMatchesApi,
	confirmMatch,
	disputeMatch,
	findMatch,
	listMatches,
	rememberMatch
} from './services.js';
import { TAMSIN, sampleMatch } from './testing.js';

useMockApi();

const BASE = 'http://localhost';
const code = (random: string) => buildCode('match', random) as MatchCode;

// Seed matches for Tamsin (player@example.com).
const WAITING_ON_ME = code('7QK2H9WD3NF'); // pending, Bea's team confirmed
const ALREADY_CONFIRMED = code('X4NC2GHJ9VQ'); // pending, Tamsin confirmed
const CONFIRMED = code('D9PW5KXE7RM');
const DISPUTED = code('R5GK9WBD2XF');
const NOT_MINE = code('C4VD8RME2TX'); // Oren against Bea
const oldest = MATCHES.filter((m) => [...m.teamA, ...m.teamB].includes('tamsin')).reduce((a, b) =>
	a.playedOn <= b.playedOn ? a : b
);

/** The real client with a cookie jar, as a browser has, counting the calls it makes. */
function browserApi() {
	const jar = new Map<string, string>();
	const calls: string[] = [];
	const fetchWithJar: typeof fetch = async (input, init) => {
		const request = new Request(input, init);
		calls.push(`${request.method} ${new URL(request.url).pathname}${new URL(request.url).search}`);
		const response = await fetch(request);
		for (const line of response.headers.getSetCookie()) {
			const [pair] = line.split(';');
			const [name, ...value] = pair.split('=');
			jar.set(name.trim(), value.join('='));
		}
		return response;
	};
	const getCookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	return { api: createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies }), calls };
}

let calls: string[];
let cache: MatchCache;

beforeEach(async () => {
	const browser = browserApi();
	calls = browser.calls;
	configureMatchesApi(browser.api);
	await browser.api.initCsrf();
	await browser.api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email: VERIFIED_EMAIL, password: MOCK_PASSWORD }
	});
	calls.length = 0;
	cache = new MatchCache(() => TAMSIN);
});

afterEach(() => configureMatchesApi());

async function failure(promise: Promise<unknown>): Promise<AppError> {
	try {
		await promise;
	} catch (cause) {
		if (isAppError(cause)) return cause;
		throw cause;
	}
	throw new Error('expected the call to fail');
}

describe('listMatches', () => {
	it('returns a page of 20 and the total, newest first, and caches them', async () => {
		const page = await listMatches(TAMSIN, 0, { cache });
		expect(page.count).toBe(26);
		expect(page.items).toHaveLength(PAGE_SIZE);
		expect(page.items[0].code).toBe(WAITING_ON_ME);
		expect(calls).toEqual([`GET /api/v1/players/${TAMSIN}/matches?limit=20&offset=0`]);
		for (const match of page.items) expect(cache.get(match.code)).toBe(match);
	});

	it('returns the rest on the next page', async () => {
		const page = await listMatches(TAMSIN, 20, { cache });
		expect(page.items).toHaveLength(6);
		expect(page.count).toBe(26);
	});

	it('shows every status to the owner', async () => {
		const page = await listMatches(TAMSIN, 0, { cache });
		const statuses = new Set(page.items.map((m) => m.status));
		expect(statuses).toEqual(new Set(['pending', 'confirmed', 'disputed', 'voided']));
	});

	it('fails with an AppError for a player who does not exist', async () => {
		const missing = buildCode('player', '0000000') as PlayerCode;
		expect((await failure(listMatches(missing, 0, { cache }))).kind).toBe('not_found');
	});
});

describe('findMatch', () => {
	it('answers from the cache with no request', async () => {
		const match = sampleMatch();
		cache.remember(match);
		expect(await findMatch(match.code, TAMSIN, { cache })).toBe(match);
		expect(calls).toEqual([]);
	});

	it('reads the list again with `fresh`, even when the cache has the match', async () => {
		cache.remember(sampleMatch({ code: CONFIRMED, status: 'pending' }));
		const found = await findMatch(CONFIRMED, TAMSIN, { cache, fresh: true });
		expect(calls).toHaveLength(1);
		expect(found?.status).toBe('confirmed');
		expect(cache.get(CONFIRMED)?.status).toBe('confirmed');
	});

	it('finds a match on the first page with one request', async () => {
		const found = await findMatch(CONFIRMED, TAMSIN, { cache });
		expect(found?.code).toBe(CONFIRMED);
		expect(calls).toHaveLength(1);
		expect(cache.get(CONFIRMED)).toBe(found);
	});

	it('scans on to later pages for an older match', async () => {
		const found = await findMatch(code(oldest.random), TAMSIN, { cache });
		expect(found?.code).toBe(code(oldest.random));
		expect(calls).toHaveLength(2);
	});

	it('gives null for a match that is not in the list, after reading all of it', async () => {
		expect(await findMatch(NOT_MINE, TAMSIN, { cache })).toBeNull();
		expect(calls).toHaveLength(2);
	});

	it('stops scanning at SCAN_LIMIT matches', async () => {
		let requests = 0;
		server.use(
			http.get('*/api/v1/players/:code/matches', () => {
				requests += 1;
				return HttpResponse.json({ items: [], count: 500 });
			})
		);
		expect(await findMatch(NOT_MINE, TAMSIN, { cache })).toBeNull();
		expect(requests).toBe(SCAN_LIMIT / PAGE_SIZE);
	});

	it('throws a network AppError when the API cannot be reached', async () => {
		server.use(http.get('*/api/v1/players/:code/matches', () => HttpResponse.error()));
		expect((await failure(findMatch(NOT_MINE, TAMSIN, { cache }))).kind).toBe('network');
	});
});

describe('confirmMatch', () => {
	it('confirms, caches the new state and notes that the player confirmed', async () => {
		const match = await confirmMatch(WAITING_ON_ME, { cache });
		// Bea's team confirmed first, so Tamsin's confirmation makes it count.
		expect(match.status).toBe('confirmed');
		expect(calls).toEqual([`POST /api/v1/matches/${WAITING_ON_ME}/confirm`]);
		expect(cache.get(WAITING_ON_ME)).toBe(match);
		expect(cache.actedOn(WAITING_ON_ME)).toBe('confirm');
	});

	it('leaves a match pending when the other team has not confirmed', async () => {
		const match = await confirmMatch(ALREADY_CONFIRMED, { cache });
		// The mock has Tamsin's team confirmed already and the other team still to go.
		expect(match.status).toBe('pending');
		expect(cache.actedOn(ALREADY_CONFIRMED)).toBe('confirm');
	});

	it('is safe to repeat', async () => {
		await confirmMatch(WAITING_ON_ME, { cache });
		expect((await confirmMatch(WAITING_ON_ME, { cache })).status).toBe('confirmed');
	});

	it('fails with a conflict for a disputed match, and does not note an action', async () => {
		const error = await failure(confirmMatch(DISPUTED, { cache }));
		expect(error.kind).toBe('conflict');
		expect(cache.actedOn(DISPUTED)).toBeUndefined();
	});

	it('fails with not found for a match the player is not in', async () => {
		expect((await failure(confirmMatch(NOT_MINE, { cache }))).kind).toBe('not_found');
	});
});

describe('disputeMatch', () => {
	it('disputes with no body, caches the new state and notes the dispute', async () => {
		const match = await disputeMatch(WAITING_ON_ME, { cache });
		expect(match.status).toBe('disputed');
		expect(calls).toEqual([`POST /api/v1/matches/${WAITING_ON_ME}/dispute`]);
		expect(cache.get(WAITING_ON_ME)).toBe(match);
		expect(cache.actedOn(WAITING_ON_ME)).toBe('dispute');
	});

	it('is safe to repeat', async () => {
		await disputeMatch(WAITING_ON_ME, { cache });
		expect((await disputeMatch(WAITING_ON_ME, { cache })).status).toBe('disputed');
	});

	it('fails with not found for a match the player is not in', async () => {
		expect((await failure(disputeMatch(NOT_MINE, { cache }))).kind).toBe('not_found');
	});
});

describe('rememberMatch', () => {
	it('seeds the cache with a recorded match and notes the submitter confirmed it', () => {
		const match = sampleMatch();
		rememberMatch(match, cache);
		expect(cache.get(match.code)).toBe(match);
		expect(cache.actedOn(match.code)).toBe('confirm');
	});
});
