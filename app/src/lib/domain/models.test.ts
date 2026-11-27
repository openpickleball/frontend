import { describe, expect, it } from 'vitest';
import { buildCode, parseMatchCode, parsePlayerCode, type PlayerCode } from './codes';
import {
	gameWinner,
	gamesWon,
	isPending,
	needsViewerConfirmation,
	otherSide,
	waitingOnOtherTeam,
	winner,
	type Match,
	type Player
} from './models';

function player(random: string, displayName: string): Player & { code: PlayerCode } {
	const result = parsePlayerCode(buildCode('player', random));
	if (!result.ok) throw new Error('fixture code is invalid');
	return { code: result.value, displayName };
}

const sam = player('SAM1111', 'Sam Example');
const alex = player('AJX1111', 'Alex Example');
const robin = player('RBN1111', 'Robin Example');
const kit = player('KEN1111', 'Kit Example');

function makeMatch(overrides: Partial<Match> = {}): Match {
	const code = parseMatchCode(buildCode('match', 'MATCH123456'));
	if (!code.ok) throw new Error('fixture code is invalid');
	return {
		code: code.value,
		status: 'pending',
		format: 'doubles',
		playedOn: '2026-06-01',
		bestOf: 3,
		scoringType: 'side_out',
		gameTarget: 11,
		teamA: { side: 'a', players: [sam, alex] },
		teamB: { side: 'b', players: [robin, kit] },
		games: [
			{ number: 1, teamA: 11, teamB: 7 },
			{ number: 2, teamA: 9, teamB: 11 },
			{ number: 3, teamA: 11, teamB: 5 }
		],
		viewerSide: null,
		viewerDecision: 'none',
		confirmedBySide: null,
		createdAt: '2026-06-01T18:00:00Z',
		event: null,
		club: null,
		...overrides
	};
}

describe('gameWinner', () => {
	it('names the side with more points', () => {
		expect(gameWinner({ teamA: 11, teamB: 3 })).toBe('a');
		expect(gameWinner({ teamA: 3, teamB: 11 })).toBe('b');
	});
	it('is null for a tie', () => {
		expect(gameWinner({ teamA: 7, teamB: 7 })).toBeNull();
	});
});

describe('gamesWon and winner', () => {
	it('counts games per side', () => {
		expect(gamesWon(makeMatch())).toEqual({ a: 2, b: 1 });
	});

	it('names the winner of a best of 3', () => {
		expect(winner(makeMatch())).toBe('a');
	});

	it('names the winner when team B wins', () => {
		const games = [
			{ number: 1, teamA: 3, teamB: 11 },
			{ number: 2, teamA: 4, teamB: 11 }
		];
		expect(winner(makeMatch({ games }))).toBe('b');
	});

	it('is null while the games do not decide the match', () => {
		const games = [{ number: 1, teamA: 11, teamB: 3 }];
		expect(winner(makeMatch({ games, bestOf: 3 }))).toBeNull();
	});

	it('a single game decides a best of 1', () => {
		const games = [{ number: 1, teamA: 11, teamB: 3 }];
		expect(winner(makeMatch({ games, bestOf: 1 }))).toBe('a');
	});

	it('needs three wins in a best of 5', () => {
		const games = [
			{ number: 1, teamA: 11, teamB: 3 },
			{ number: 2, teamA: 11, teamB: 3 },
			{ number: 3, teamA: 3, teamB: 11 }
		];
		expect(winner(makeMatch({ games, bestOf: 5 }))).toBeNull();
		const decided = [...games, { number: 4, teamA: 11, teamB: 9 }];
		expect(winner(makeMatch({ games: decided, bestOf: 5 }))).toBe('a');
	});
});

describe('isPending', () => {
	it.each([
		['pending', true],
		['confirmed', false],
		['disputed', false],
		['voided', false]
	] as const)('%s -> %s', (status, expected) => {
		expect(isPending(makeMatch({ status }))).toBe(expected);
	});
});

describe('otherSide', () => {
	it('flips a side', () => {
		expect(otherSide('a')).toBe('b');
		expect(otherSide('b')).toBe('a');
	});
});

describe('needsViewerConfirmation and waitingOnOtherTeam', () => {
	const viewer = (
		status: Match['status'],
		viewerSide: Match['viewerSide'],
		confirmedBySide: Match['confirmedBySide']
	) => makeMatch({ status, viewerSide, confirmedBySide });

	it('needs the player when their team has not confirmed a pending match', () => {
		const match = viewer('pending', 'a', { a: false, b: true });
		expect(needsViewerConfirmation(match)).toBe(true);
		expect(waitingOnOtherTeam(match)).toBe(false);
		expect(needsViewerConfirmation(viewer('pending', 'b', { a: false, b: false }))).toBe(true);
	});

	it("waits on the other team once the player's team has confirmed", () => {
		const match = viewer('pending', 'a', { a: true, b: false });
		expect(needsViewerConfirmation(match)).toBe(false);
		expect(waitingOnOtherTeam(match)).toBe(true);
		expect(waitingOnOtherTeam(viewer('pending', 'b', { a: false, b: true }))).toBe(true);
	});

	it('is neither when the match is not pending or the player did not play', () => {
		for (const status of ['confirmed', 'disputed', 'voided'] as const) {
			const match = viewer(status, 'a', { a: false, b: false });
			expect(needsViewerConfirmation(match)).toBe(false);
			expect(waitingOnOtherTeam(match)).toBe(false);
		}
		const outsider = viewer('pending', null, null);
		expect(needsViewerConfirmation(outsider)).toBe(false);
		expect(waitingOnOtherTeam(outsider)).toBe(false);
	});
});
