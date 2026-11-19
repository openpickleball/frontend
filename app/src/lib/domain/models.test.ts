import { describe, expect, it } from 'vitest';
import { buildCode, parseMatchCode, parsePlayerCode, type PlayerCode } from './codes';
import {
	didWin,
	gameWinner,
	gamesWon,
	isPending,
	isPrivatePlayer,
	myTeam,
	otherSide,
	teamOn,
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
const nobody = player('NBD1111', 'Nobody Example');
const privatePlayer: Player = { code: null, displayName: 'Private player' };

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

describe('myTeam', () => {
	it('finds the team a player is on', () => {
		const match = makeMatch();
		expect(myTeam(match, sam.code)).toBe(match.teamA);
		expect(myTeam(match, kit.code)).toBe(match.teamB);
	});

	it('is null when the player did not play', () => {
		expect(myTeam(makeMatch(), nobody.code)).toBeNull();
	});

	it('does not match private players', () => {
		const match = makeMatch({ teamB: { side: 'b', players: [privatePlayer, kit] } });
		expect(myTeam(match, nobody.code)).toBeNull();
		expect(myTeam(match, kit.code)?.side).toBe('b');
	});
});

describe('didWin', () => {
	it('is true for the winning team and false for the other', () => {
		const match = makeMatch();
		expect(didWin(match, alex.code)).toBe(true);
		expect(didWin(match, robin.code)).toBe(false);
	});

	it('is null for a bystander or an undecided match', () => {
		expect(didWin(makeMatch(), nobody.code)).toBeNull();
		expect(didWin(makeMatch({ games: [] }), sam.code)).toBeNull();
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

describe('small helpers', () => {
	it('flags a private player by the missing code', () => {
		expect(isPrivatePlayer(privatePlayer)).toBe(true);
		expect(isPrivatePlayer(sam)).toBe(false);
	});

	it('flips a side', () => {
		expect(otherSide('a')).toBe('b');
		expect(otherSide('b')).toBe('a');
	});

	it('picks a team by side', () => {
		const match = makeMatch();
		expect(teamOn(match, 'a')).toBe(match.teamA);
		expect(teamOn(match, 'b')).toBe(match.teamB);
	});
});
