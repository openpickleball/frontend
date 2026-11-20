import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { allauthParams, createApi, isAppError, type Api, type AppError } from '#lib/api/index.js';
import { buildCode, type MatchCode, type PlayerCode } from '#lib/domain/index.js';
import { MATCHES, MOCK_PASSWORD, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { MatchCache } from './cache.svelte.js';
import {
	PAGE_SIZE,
	confirmMatch,
	countMatches,
	disputeMatch,
	getMatch,
	listAwaitingConfirmation,
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

let api: Api;
let calls: string[];
let cache: MatchCache;

beforeEach(async () => {
	const browser = browserApi();
	api = browser.api;
	calls = browser.calls;
	await api.initCsrf();
	await api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email: VERIFIED_EMAIL, password: MOCK_PASSWORD }
	});
	calls.length = 0;
	cache = new MatchCache(() => TAMSIN);
});

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
		const page = await listMatches(TAMSIN, 0, { cache, api });
		expect(page.count).toBe(26);
		expect(page.items).toHaveLength(PAGE_SIZE);
		expect(page.items[0].code).toBe(WAITING_ON_ME);
		expect(calls).toEqual([`GET /api/v1/players/${TAMSIN}/matches?limit=20&offset=0`]);
		for (const match of page.items) expect(cache.get(match.code)).toBe(match);
	});

	it('returns the rest on the next page', async () => {
		const page = await listMatches(TAMSIN, 20, { cache, api });
		expect(page.items).toHaveLength(6);
		expect(page.count).toBe(26);
	});

	it('shows every status to the owner', async () => {
		const page = await listMatches(TAMSIN, 0, { cache, api });
		const statuses = new Set(page.items.map((m) => m.status));
		expect(statuses).toEqual(new Set(['pending', 'confirmed', 'disputed', 'voided']));
	});

	it('fails with an AppError for a player who does not exist', async () => {
		const missing = buildCode('player', '0000000') as PlayerCode;
		expect((await failure(listMatches(missing, 0, { cache, api }))).kind).toBe('not_found');
	});
});

describe('countMatches', () => {
	it('reads the total from a one-match page', async () => {
		expect(await countMatches(TAMSIN, { api })).toBe(26);
		expect(calls).toEqual([`GET /api/v1/players/${TAMSIN}/matches?limit=1`]);
	});

	it('fails with an AppError for a player who does not exist', async () => {
		const missing = buildCode('player', '0000000') as PlayerCode;
		expect((await failure(countMatches(missing, { api }))).kind).toBe('not_found');
	});
});

describe('listAwaitingConfirmation', () => {
	it("lists the pending matches no one on the player's team has confirmed, newest first", async () => {
		const page = await listAwaitingConfirmation(0, { cache, api });
		expect(calls).toEqual(['GET /api/v1/me/matches/awaiting-confirmation?limit=20&offset=0']);
		expect(page.items.map((m) => m.code)).toEqual([WAITING_ON_ME, code('3FTB8ZRMK6P')]);
		expect(page.count).toBe(2);
		for (const match of page.items) {
			expect(match.status).toBe('pending');
			expect(match.viewerSide).not.toBeNull();
			expect(match.confirmedBySide?.[match.viewerSide!]).toBe(false);
			expect(cache.get(match.code)).toBe(match);
		}
	});

	it("leaves out a match the player's team confirmed", async () => {
		const page = await listAwaitingConfirmation(0, { cache, api });
		expect(page.items.map((m) => m.code)).not.toContain(ALREADY_CONFIRMED);
	});

	it('drops a match once the player confirms it', async () => {
		await confirmMatch(WAITING_ON_ME, { cache, api });
		const page = await listAwaitingConfirmation(0, { cache, api });
		expect(page.items.map((m) => m.code)).toEqual([code('3FTB8ZRMK6P')]);
	});

	it('drops a match once the player disputes it', async () => {
		await disputeMatch(WAITING_ON_ME, { cache, api });
		expect((await listAwaitingConfirmation(0, { cache, api })).count).toBe(1);
	});

	it('pages with limit and offset', async () => {
		const page = await listAwaitingConfirmation(1, { limit: 1, cache, api });
		expect(page.items.map((m) => m.code)).toEqual([code('3FTB8ZRMK6P')]);
		expect(page.count).toBe(2);
	});
});

describe('getMatch', () => {
	it('reads the match from the API and remembers it', async () => {
		const found = await getMatch(CONFIRMED, { cache, api });
		expect(found.code).toBe(CONFIRMED);
		expect(found.status).toBe('confirmed');
		expect(found.viewerSide).not.toBeNull();
		expect(calls).toEqual([`GET /api/v1/matches/${CONFIRMED}`]);
		expect(cache.get(CONFIRMED)).toBe(found);
	});

	it('asks the API even when the cache has the match, and replaces the cached copy', async () => {
		cache.remember(sampleMatch({ code: CONFIRMED, status: 'pending' }));
		const found = await getMatch(CONFIRMED, { cache, api });
		expect(calls).toHaveLength(1);
		expect(found.status).toBe('confirmed');
		expect(cache.get(CONFIRMED)?.status).toBe('confirmed');
	});

	it('keeps the match out of the cache with `remember: false`', async () => {
		const found = await getMatch(CONFIRMED, { cache, remember: false, api });
		expect(found.code).toBe(CONFIRMED);
		expect(cache.get(CONFIRMED)).toBeUndefined();
	});

	it('finds the oldest match with one request, with no scan of the list', async () => {
		const found = await getMatch(code(oldest.random), { cache, api });
		expect(found.code).toBe(code(oldest.random));
		expect(calls).toHaveLength(1);
	});

	it('reads a match in every status the player is in', async () => {
		expect((await getMatch(WAITING_ON_ME, { cache, api })).status).toBe('pending');
		expect((await getMatch(DISPUTED, { cache, api })).status).toBe('disputed');
	});

	it('throws not_found for a match the player was not in', async () => {
		expect((await failure(getMatch(NOT_MINE, { cache, api }))).kind).toBe('not_found');
		expect(cache.get(NOT_MINE)).toBeUndefined();
	});

	it('throws not_found for an unknown code', async () => {
		expect((await failure(getMatch(code('00000000000'), { cache, api }))).kind).toBe('not_found');
	});

	it('throws a network AppError when the API cannot be reached', async () => {
		server.use(http.get('*/api/v1/matches/:code', () => HttpResponse.error()));
		expect((await failure(getMatch(CONFIRMED, { cache, api }))).kind).toBe('network');
	});
});

describe('confirmMatch', () => {
	it("confirms and caches the new state, with the player's own decision", async () => {
		const match = await confirmMatch(WAITING_ON_ME, { cache, api });
		// Bea's team confirmed first, so Tamsin's confirmation makes it count.
		expect(match.status).toBe('confirmed');
		expect(calls).toEqual([`POST /api/v1/matches/${WAITING_ON_ME}/confirm`]);
		expect(cache.get(WAITING_ON_ME)).toBe(match);
		expect(match.viewerDecision).toBe('confirm');
		expect(match.confirmedBySide).toEqual({ a: true, b: true });
	});

	it('leaves a match pending when the other team has not confirmed', async () => {
		const match = await confirmMatch(ALREADY_CONFIRMED, { cache, api });
		// The mock has Tamsin's team confirmed already and the other team still to go.
		expect(match.status).toBe('pending');
		expect(match.confirmedBySide).toEqual({ a: true, b: false });
	});

	it('is safe to repeat', async () => {
		await confirmMatch(WAITING_ON_ME, { cache, api });
		expect((await confirmMatch(WAITING_ON_ME, { cache, api })).status).toBe('confirmed');
	});

	it('fails with a conflict for a disputed match', async () => {
		const error = await failure(confirmMatch(DISPUTED, { cache, api }));
		expect(error.kind).toBe('conflict');
	});

	it('fails with not found for a match the player is not in', async () => {
		expect((await failure(confirmMatch(NOT_MINE, { cache, api }))).kind).toBe('not_found');
	});
});

describe('disputeMatch', () => {
	it('disputes with no body and caches the new state', async () => {
		const match = await disputeMatch(WAITING_ON_ME, { cache, api });
		expect(match.status).toBe('disputed');
		expect(calls).toEqual([`POST /api/v1/matches/${WAITING_ON_ME}/dispute`]);
		expect(cache.get(WAITING_ON_ME)).toBe(match);
		expect(match.viewerDecision).toBe('dispute');
	});

	it('is safe to repeat', async () => {
		await disputeMatch(WAITING_ON_ME, { cache, api });
		expect((await disputeMatch(WAITING_ON_ME, { cache, api })).status).toBe('disputed');
	});

	it('fails with not found for a match the player is not in', async () => {
		expect((await failure(disputeMatch(NOT_MINE, { cache, api }))).kind).toBe('not_found');
	});
});

describe('rememberMatch', () => {
	it('seeds the cache with a recorded match', () => {
		const match = sampleMatch();
		rememberMatch(match, cache);
		expect(cache.get(match.code)).toBe(match);
	});

	it('notes the match as just recorded, once', () => {
		const match = sampleMatch();
		rememberMatch(match, cache);
		expect(cache.takeRecorded(match.code)).toBe(true);
		expect(cache.takeRecorded(match.code)).toBe(false);
	});
});
