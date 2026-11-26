import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { allauthParams, createApi, isAppError, type Api, type AppError } from '#lib/api/index.js';
import { buildCode, type MatchCode, type PlayerCode } from '#lib/domain/index.js';
import { MATCHES, MOCK_PASSWORD, PLAYERS, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { mockStore } from '#lib/mocks/store.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { MatchCache } from './cache.svelte.js';
import {
	PAGE_SIZE,
	confirmMatch,
	countMatches,
	disputeMatch,
	findHold,
	getMatch,
	listAwaitingConfirmation,
	listMatches,
	listMyDisputes,
	listMyHolds,
	rememberCorrection,
	rememberMatch,
	vouchForMatch,
	withdrawDispute
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
// Held matches. Rosa's team and the other match vouched for the first, so Tamsin's vouch ends
// its hold. Tamsin's team vouched for the second already.
const HELD = code('H2ZA6TQN4CJ');
const HELD_VOUCHED = code('6YEM3HNV8QT');
// An older match only Tamsin disputed. It was pending before her dispute.
const MY_DISPUTE = code(
	MATCHES.find((m) => m.status === 'disputed' && m.random !== 'R5GK9WBD2XF')!.random
);
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

describe('listMyDisputes', () => {
	it('lists the disputed matches the player is in, whoever disputed them, newest first', async () => {
		const page = await listMyDisputes(0, { cache, api });
		expect(calls).toEqual([`GET /api/v1/me/matches/disputes?limit=${PAGE_SIZE}&offset=0`]);
		expect(page.items.map((m) => m.code)).toEqual([DISPUTED, MY_DISPUTE]);
		expect(page.count).toBe(2);
		expect(page.items.map((m) => m.viewerDecision)).toEqual(['withdraw', 'dispute']);
		expect(cache.get(DISPUTED)).toBe(page.items[0]);
	});

	it('picks up a match once the player disputes it', async () => {
		await disputeMatch(WAITING_ON_ME, { cache, api });
		const page = await listMyDisputes(0, { cache, api });
		expect(page.items.map((m) => m.code)).toContain(WAITING_ON_ME);
	});

	it('drops a match once its last open dispute is withdrawn', async () => {
		await withdrawDispute(MY_DISPUTE, { cache, api });
		const page = await listMyDisputes(0, { cache, api });
		expect(page.items.map((m) => m.code)).toEqual([DISPUTED]);
	});

	it('pages with limit and offset', async () => {
		const page = await listMyDisputes(1, { limit: 1, cache, api });
		expect(page.items.map((m) => m.code)).toEqual([MY_DISPUTE]);
		expect(page.count).toBe(2);
	});
});

describe('withdrawDispute', () => {
	it('withdraws with no body, and the match goes back to pending', async () => {
		const match = await withdrawDispute(MY_DISPUTE, { cache, api });
		expect(calls).toEqual([`POST /api/v1/matches/${MY_DISPUTE}/withdraw-dispute`]);
		expect(match).toMatchObject({ status: 'pending', viewerDecision: 'withdraw' });
		expect(cache.get(MY_DISPUTE)).toBe(match);
	});

	it('goes back to confirmed when the match was confirmed before the dispute', async () => {
		expect((await disputeMatch(CONFIRMED, { cache, api })).status).toBe('disputed');
		expect((await withdrawDispute(CONFIRMED, { cache, api })).status).toBe('confirmed');
	});

	it('keeps the match disputed while another player still disputes it', async () => {
		// Oren, her opponent, disputes it too. Her withdraw leaves his dispute open.
		const oren = PLAYERS.find((p) => p.key === 'oren')!.accountEmail!;
		expect(mockStore.changeMatch(oren, MY_DISPUTE, 'dispute').ok).toBe(true);
		const match = await withdrawDispute(MY_DISPUTE, { cache, api });
		expect(match).toMatchObject({ status: 'disputed', viewerDecision: 'withdraw' });
	});

	it('is safe to repeat', async () => {
		await withdrawDispute(MY_DISPUTE, { cache, api });
		expect((await withdrawDispute(MY_DISPUTE, { cache, api })).status).toBe('pending');
	});

	it('leaves a second dispute after a withdraw with no effect', async () => {
		await withdrawDispute(MY_DISPUTE, { cache, api });
		const again = await disputeMatch(MY_DISPUTE, { cache, api });
		expect(again).toMatchObject({ status: 'pending', viewerDecision: 'withdraw' });
	});

	it('fails with a conflict when the player has no open dispute on the match', async () => {
		expect((await failure(withdrawDispute(WAITING_ON_ME, { cache, api }))).kind).toBe('conflict');
		expect((await failure(withdrawDispute(CONFIRMED, { cache, api }))).kind).toBe('conflict');
	});

	it('fails with not found for a match the player is not in', async () => {
		expect((await failure(withdrawDispute(NOT_MINE, { cache, api }))).kind).toBe('not_found');
	});
});

describe('listMyHolds', () => {
	it('lists the held matches she may vouch for, newest first, and caches them', async () => {
		const page = await listMyHolds(0, { cache, api });
		expect(calls).toEqual(['GET /api/v1/me/matches/holds?limit=20&offset=0']);
		expect(page.count).toBe(2);
		expect(page.items.map((hold) => [hold.match.code, hold.vouched])).toEqual([
			[HELD, false],
			[HELD_VOUCHED, true]
		]);
		expect(cache.get(HELD)).toBe(page.items[0].match);
		expect(cache.holdOf(HELD)).toEqual({ vouched: false });
		expect(cache.holdOf(HELD_VOUCHED)).toEqual({ vouched: true });
	});

	it('drops a match once its hold ends', async () => {
		await vouchForMatch(HELD, { cache, api });
		const page = await listMyHolds(0, { cache, api });
		expect(page.items.map((hold) => hold.match.code)).toEqual([HELD_VOUCHED]);
		expect(cache.holdOf(HELD)).toBeUndefined();
	});

	it('pages with limit and offset, and keeps holds a partial page left out', async () => {
		await listMyHolds(0, { cache, api });
		const page = await listMyHolds(1, { limit: 1, cache, api });
		expect(page.items.map((hold) => hold.match.code)).toEqual([HELD_VOUCHED]);
		expect(cache.holdOf(HELD)).toEqual({ vouched: false });
	});
});

describe('findHold', () => {
	it('finds a held match in the holds list', async () => {
		expect(await findHold(HELD_VOUCHED, { cache, api })).toMatchObject({
			vouched: true,
			match: { code: HELD_VOUCHED, status: 'confirmed' }
		});
		expect(calls).toEqual(['GET /api/v1/me/matches/holds?limit=100&offset=0']);
	});

	it('says null for a match that is not held, and ends a cached hold', async () => {
		cache.rememberHolds([{ match: sampleMatch({ code: CONFIRMED }), vouched: false }]);
		expect(await findHold(CONFIRMED, { cache, api })).toBeNull();
		expect(cache.holdOf(CONFIRMED)).toBeUndefined();
	});

	it('reads the next page when the first one has not got the match', async () => {
		const holdOf = (match: MatchCode) => ({
			match: mockStore.matchOut(mockStore.matchByCode(match)!, VERIFIED_EMAIL),
			vouched: false
		});
		let page = 0;
		server.use(
			http.get('*/api/v1/me/matches/holds', () => {
				page += 1;
				return HttpResponse.json({ items: [holdOf(page === 1 ? CONFIRMED : HELD)], count: 101 });
			})
		);
		expect((await findHold(HELD, { cache, api }))?.match.code).toBe(HELD);
		expect(page).toBe(2);
	});

	it('stops after 10 pages when the count is wrong', async () => {
		let pages = 0;
		server.use(
			http.get('*/api/v1/me/matches/holds', () => {
				pages += 1;
				const match = mockStore.matchOut(mockStore.matchByCode(CONFIRMED)!, VERIFIED_EMAIL);
				return HttpResponse.json({ items: [{ match, vouched: false }], count: 1_000_000 });
			})
		);
		expect(await findHold(HELD, { cache, api })).toBeNull();
		expect(pages).toBe(10);
	});

	it('throws an AppError when the list fails', async () => {
		server.use(http.get('*/api/v1/me/matches/holds', () => HttpResponse.error()));
		expect((await failure(findHold(HELD, { cache, api }))).kind).toBe('network');
	});
});

describe('vouchForMatch', () => {
	it('vouches with no body and caches the match and the vouch', async () => {
		await listMyHolds(0, { cache, api });
		calls.length = 0;
		const match = await vouchForMatch(HELD, { cache, api });
		expect(calls).toEqual([`POST /api/v1/matches/${HELD}/vouch`]);
		expect(match).toMatchObject({ code: HELD, status: 'confirmed' });
		expect(cache.get(HELD)).toBe(match);
		expect(cache.holdOf(HELD)).toEqual({ vouched: true });
	});

	it('is safe to repeat while the hold waits on the other side', async () => {
		expect((await vouchForMatch(HELD_VOUCHED, { cache, api })).code).toBe(HELD_VOUCHED);
		expect((await findHold(HELD_VOUCHED, { cache, api }))?.vouched).toBe(true);
	});

	it('fails with a conflict for a match no hold keeps', async () => {
		expect((await failure(vouchForMatch(CONFIRMED, { cache, api }))).kind).toBe('conflict');
		await vouchForMatch(HELD, { cache, api });
		expect((await failure(vouchForMatch(HELD, { cache, api }))).kind).toBe('conflict');
	});

	it('fails with not found for a match the player is not in', async () => {
		expect((await failure(vouchForMatch(NOT_MINE, { cache, api }))).kind).toBe('not_found');
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

describe('rememberCorrection', () => {
	const NEW = buildCode('match', 'FXD00000001') as MatchCode;

	it('keeps the correction, voids the old copy and links the old match to the new one', () => {
		const old = sampleMatch({ status: 'disputed' });
		cache.remember(old);
		cache.rememberHolds([{ match: old, vouched: false }]);
		const correction = sampleMatch({ code: NEW });
		rememberCorrection(correction, old.code, cache);
		expect(cache.get(NEW)).toBe(correction);
		expect(cache.get(old.code)?.status).toBe('voided');
		expect(cache.holdOf(old.code)).toBeUndefined();
		expect(cache.replacementOf(old.code)).toBe(NEW);
	});

	it('notes the correction as just corrected, once, and not as recorded', () => {
		const old = sampleMatch();
		rememberCorrection(sampleMatch({ code: NEW }), old.code, cache);
		expect(cache.takeRecorded(NEW)).toBe(false);
		expect(cache.takeCorrected(NEW)).toBe(true);
		expect(cache.takeCorrected(NEW)).toBe(false);
	});
});
