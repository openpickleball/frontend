import { describe, expect, it } from 'vitest';
import { parseMatchCode, parsePlayerCode } from '../domain/codes';
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

	it('labels ratings as demonstration ratings', () => {
		for (const rating of Object.values(RATINGS)) expect(rating?.demonstration).toBe(true);
	});
});
