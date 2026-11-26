import { describe, expect, it } from 'vitest';
import { buildCode, parseMatchCode, parsePlayerCode } from '../domain/codes';
import { validateMatch } from '../domain/scores';
import { ACCOUNTS, MATCHES, PLAYERS, RATINGS, VERIFIED_EMAIL } from './fixtures';
import { createMockStore } from './store';

describe('fixtures', () => {
	it('has about eight players with valid codes, one of them private', () => {
		expect(PLAYERS).toHaveLength(8);
		for (const player of PLAYERS) expect(parsePlayerCode(player.code).ok).toBe(true);
		expect(new Set(PLAYERS.map((p) => p.code)).size).toBe(8);
		expect(ACCOUNTS.filter((a) => !a.active)).toHaveLength(1);
	});

	it('uses example.com addresses only', () => {
		for (const account of ACCOUNTS) expect(account.email).toMatch(/@example\.com$/);
		expect(ACCOUNTS.find((a) => a.email === 'player@example.com')?.verified).toBe(true);
		expect(ACCOUNTS.filter((a) => !a.verified).map((a) => a.email)).toEqual([
			'unverified@example.com'
		]);
	});

	it('has matches in every status, singles and doubles, and enough for two pages', () => {
		const store = createMockStore();
		const mine = store.state.matches.filter((m) =>
			m.teamA.concat(m.teamB).includes(PLAYERS[0].code)
		);
		expect(mine.length).toBeGreaterThan(20);
		for (const status of ['pending', 'confirmed', 'disputed', 'voided']) {
			expect(MATCHES.some((m) => m.status === status)).toBe(true);
		}
		expect(MATCHES.some((m) => m.format === 'singles')).toBe(true);
		expect(MATCHES.some((m) => m.format === 'doubles')).toBe(true);
	});

	it('shows the viewer fields for a participant and a stranger', () => {
		const store = createMockStore();
		const accountOf = (key: string) => PLAYERS.find((p) => p.key === key)?.accountEmail ?? null;
		const waiting = store.state.matches.find((m) => m.seq === MATCHES.length);
		if (!waiting) throw new Error('fixture match is missing');
		// Tamsin plays on side A. Bea, on side B, has confirmed.
		expect(store.matchOut(waiting, VERIFIED_EMAIL)).toMatchObject({
			my_team: 'A',
			my_decision: 'none',
			confirmed_by_team: { a: false, b: true },
			created_at: '2026-11-14T18:00:00Z'
		});
		const outsider = store.matchOut(waiting, accountOf('rosa'));
		expect(outsider).toMatchObject({ my_team: null, my_decision: 'none', confirmed_by_team: null });
		// Disputing straight away records the dispute and no confirmation.
		store.changeMatch(VERIFIED_EMAIL, waiting.code, 'dispute');
		expect(store.matchOut(waiting, VERIFIED_EMAIL)).toMatchObject({
			my_decision: 'dispute',
			confirmed_by_team: { a: false, b: true }
		});
		expect(store.matchOut(waiting, null).my_team).toBeNull();
	});

	// The backend lets a participant dispute a match that is already confirmed (workflow.dispute_match).
	it('reports a dispute after a confirm without taking the confirmation back', () => {
		const store = createMockStore();
		const waiting = store.state.matches.find((m) => m.seq === MATCHES.length);
		if (!waiting) throw new Error('fixture match is missing');
		expect(store.changeMatch(VERIFIED_EMAIL, waiting.code, 'confirm').ok).toBe(true);
		expect(store.matchOut(waiting, VERIFIED_EMAIL)).toMatchObject({
			my_decision: 'confirm',
			confirmed_by_team: { a: true, b: true },
			status: 'confirmed'
		});
		expect(store.changeMatch(VERIFIED_EMAIL, waiting.code, 'dispute').ok).toBe(true);
		// A dispute is not a confirmation: Tamsin's side still counts as confirmed.
		expect(store.matchOut(waiting, VERIFIED_EMAIL)).toMatchObject({
			my_decision: 'dispute',
			confirmed_by_team: { a: true, b: true },
			status: 'disputed'
		});
	});

	it('reports a withdrawn dispute as withdraw, and disputing again changes nothing', () => {
		const store = createMockStore();
		const disputed = store.matchByCode(buildCode('match', 'R5GK9WBD2XF'));
		if (!disputed) throw new Error('fixture match is missing');
		// Tamsin withdrew her dispute. Bea's dispute keeps the match disputed.
		expect(store.matchOut(disputed, VERIFIED_EMAIL)).toMatchObject({
			status: 'disputed',
			my_decision: 'withdraw'
		});
		const before = disputed.decisions.length;
		expect(store.changeMatch(VERIFIED_EMAIL, disputed.code, 'dispute').ok).toBe(true);
		expect(disputed.decisions).toHaveLength(before);
		expect(store.matchOut(disputed, VERIFIED_EMAIL).my_decision).toBe('withdraw');
	});

	it('withdraws as workflow.withdraw_dispute does', () => {
		const store = createMockStore();
		const oren = PLAYERS.find((p) => p.key === 'oren')!.accountEmail!;
		const own = store.state.matches.find(
			(m) =>
				m.status === 'disputed' &&
				m.decisions.every((d) => d.player === PLAYERS[0].code && d.decision === 'dispute')
		);
		const shared = store.matchByCode(buildCode('match', 'R5GK9WBD2XF'));
		const confirmed = store.matchByCode(buildCode('match', 'D9PW5KXE7RM'));
		const notHers = store.matchByCode(buildCode('match', 'C4VD8RME2TX'));
		if (!own || !shared || !confirmed || !notHers) throw new Error('fixture match is missing');

		// Not in the match: the unknown-code 404.
		expect(store.withdrawDispute(VERIFIED_EMAIL, notHers.code)).toEqual({
			ok: false,
			kind: 'not_found'
		});
		// No open dispute of hers: 409.
		expect(store.withdrawDispute(VERIFIED_EMAIL, confirmed.code)).toEqual({
			ok: false,
			kind: 'conflict'
		});
		// Already withdrawn: a repeat changes nothing, and Bea's dispute keeps it disputed.
		expect(store.withdrawDispute(VERIFIED_EMAIL, shared.code).ok).toBe(true);
		expect(shared.status).toBe('disputed');

		// Her own dispute, the only one open: the match goes back to pending.
		expect(store.withdrawDispute(VERIFIED_EMAIL, own.code).ok).toBe(true);
		expect(store.matchOut(own, VERIFIED_EMAIL)).toMatchObject({
			status: 'pending',
			my_decision: 'withdraw'
		});
		expect(store.listMyDisputes(VERIFIED_EMAIL, 20, 0).items.map((m) => m.code)).toEqual([
			shared.code
		]);

		// A confirmed match she disputes goes back to confirmed once Oren's dispute is withdrawn too.
		const both = store.state.matches.find(
			(m) => m.status === 'confirmed' && m.teamA.includes(PLAYERS[0].code) && m.teamB.length === 1
		)!;
		const opponent = PLAYERS.find((p) => p.code === both.teamB[0])!.accountEmail!;
		store.changeMatch(VERIFIED_EMAIL, both.code, 'dispute');
		store.changeMatch(opponent, both.code, 'dispute');
		store.withdrawDispute(VERIFIED_EMAIL, both.code);
		expect(both.status).toBe('disputed');
		store.withdrawDispute(opponent, both.code);
		expect(both.status).toBe('confirmed');

		// A voided match is a 409, even after a withdraw.
		own.status = 'voided';
		expect(store.withdrawDispute(VERIFIED_EMAIL, own.code)).toEqual({
			ok: false,
			kind: 'conflict'
		});
		expect(store.listMyDisputes(oren, 20, 0).items.map((m) => m.code)).not.toContain(own.code);
		expect(store.listMyDisputes('nobody@example.com', 20, 0)).toEqual({ items: [], count: 0 });
	});

	it("lists a pending match as awaiting until the player's team confirms or disputes", () => {
		const store = createMockStore();
		const codes = () =>
			store.listAwaitingConfirmation(VERIFIED_EMAIL, 20, 0).items.map((m) => m.code);
		const waiting = store.state.matches.find((m) => m.seq === MATCHES.length);
		if (!waiting) throw new Error('fixture match is missing');
		expect(codes()).toContain(waiting.code);
		store.changeMatch(VERIFIED_EMAIL, waiting.code, 'confirm');
		expect(codes()).not.toContain(waiting.code);
		expect(store.listAwaitingConfirmation('nobody@example.com', 20, 0)).toEqual({
			items: [],
			count: 0
		});
	});

	it('has valid, unique match codes', () => {
		const store = createMockStore();
		const codes = store.state.matches.map((m) => m.code);
		for (const code of codes) expect(parseMatchCode(code).ok).toBe(true);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('has scores that pass the same rules the backend applies', () => {
		const store = createMockStore();
		const now = new Date('2026-11-17T12:00:00Z');
		for (const match of store.state.matches) {
			const result = validateMatch(
				{
					format: match.format,
					playedOn: match.playedOn,
					teamA: match.teamA,
					teamB: match.teamB,
					games: match.games.map((g) => ({ teamA: g.a, teamB: g.b })),
					gameTarget: match.gameTarget,
					scoringType: match.scoringType
				},
				now
			);
			expect(result.ok, match.code).toBe(true);
			if (result.ok) expect(result.value.bestOf, match.code).toBe(match.bestOf);
		}
	});

	it('labels ratings as demonstration ratings, with reliability 0 to 100', () => {
		for (const byFormat of Object.values(RATINGS)) {
			for (const rating of Object.values(byFormat ?? {})) {
				expect(rating.demonstration).toBe(true);
				expect(rating.reliability).toBeGreaterThan(1);
				expect(rating.reliability).toBeLessThanOrEqual(100);
			}
		}
	});
});

describe('the mock store snapshot', () => {
	it('restores its own snapshot', () => {
		const store = createMockStore();
		expect(store.restore(store.snapshot())).toBe(true);
	});

	it('drops a snapshot whose players have the old shape (home club, no city)', () => {
		const store = createMockStore();
		const old = JSON.parse(store.snapshot()) as { players: Record<string, unknown>[] };
		old.players = old.players.map(({ code, displayName, accountEmail, privacy }) => ({
			code,
			displayName,
			accountEmail,
			homeClub: null,
			privacy
		}));
		expect(store.restore(JSON.stringify(old))).toBe(false);
		expect(store.state.players[0]).toHaveProperty('city');
	});

	it('drops a snapshot whose ratings have the old mocked shape', () => {
		const store = createMockStore();
		const old = JSON.parse(store.snapshot()) as { ratings: Record<string, unknown> };
		old.ratings = { [PLAYERS[0].code]: { ratings: {}, demonstration: true } };
		expect(store.restore(JSON.stringify(old))).toBe(false);
	});

	it('restores a snapshot from before the signup hold', () => {
		const store = createMockStore();
		const old = JSON.parse(store.snapshot()) as Record<string, unknown>;
		delete old.signupHold;
		expect(store.restore(JSON.stringify(old))).toBe(true);
		expect(store.state.signupHold ?? null).toBeNull();
	});

	it('restores a snapshot with a hold in this shape', () => {
		const store = createMockStore();
		store.holdSignup('hold@example.com', {
			birthYear: 1990,
			birthMonth: 6,
			genderDivision: 'womens',
			firstName: 'Fern',
			lastName: 'Mock',
			city: '',
			region: ''
		});
		const saved = store.snapshot();
		const other = createMockStore();
		expect(other.restore(saved)).toBe(true);
		expect(other.state.signupHold?.email).toBe('hold@example.com');
	});

	it.each([
		['a string', 'held'],
		['a hold with no names', { email: null, birthYear: 1990, birthMonth: 6 }],
		[
			'a hold with a numeric email',
			{
				email: 7,
				birthYear: 1990,
				birthMonth: 6,
				genderDivision: 'mens',
				firstName: 'Sam',
				lastName: 'Rivera',
				city: '',
				region: ''
			}
		]
	])('drops a snapshot whose hold is %s', (_, hold) => {
		const store = createMockStore();
		const old = JSON.parse(store.snapshot()) as Record<string, unknown>;
		old.signupHold = hold;
		expect(store.restore(JSON.stringify(old))).toBe(false);
	});
});
