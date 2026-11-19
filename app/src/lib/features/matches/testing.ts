/**
 * Helpers for this feature's tests: made-up domain matches and codes.
 */
import {
	buildCode,
	type Game,
	type Match,
	type MatchCode,
	type Player,
	type PlayerCode,
	type Team
} from '#lib/domain/index.js';

export const TAMSIN = buildCode('player', '4RWN8TQ') as PlayerCode;
export const OREN = buildCode('player', '9HJD3XK') as PlayerCode;
export const BEA = buildCode('player', 'M2CF7YP') as PlayerCode;
export const KIT = buildCode('player', 'T6BZ0NQ') as PlayerCode;

export const player = (code: PlayerCode | null, displayName: string): Player => ({
	code,
	displayName
});

export const tamsin = player(TAMSIN, 'Tamsin Vale');
export const oren = player(OREN, 'Oren Quill');
export const bea = player(BEA, 'Bea Marlowe');
export const kit = player(KIT, 'Kit Ashdown');
export const privatePlayer = player(null, 'Private player');

export const team = (side: 'a' | 'b', ...players: Player[]): Team => ({ side, players });

export const games = (...scores: [number, number][]): Game[] =>
	scores.map(([teamA, teamB], index) => ({ number: index + 1, teamA, teamB }));

/** Doubles, best of 3, Tamsin and Oren beat Bea and Kit 2-1. Pending unless changed. */
export function sampleMatch(overrides: Partial<Match> = {}): Match {
	return {
		code: buildCode('match', '7QK2H9WD3NF') as MatchCode,
		status: 'pending',
		format: 'doubles',
		playedOn: '2026-11-14',
		bestOf: 3,
		scoringType: 'side_out',
		gameTarget: 11,
		teamA: team('a', tamsin, oren),
		teamB: team('b', bea, kit),
		games: games([11, 7], [9, 11], [11, 4]),
		viewerSide: null,
		viewerDecision: 'none',
		confirmedBySide: null,
		createdAt: '2026-11-14T18:00:00Z',
		...overrides
	};
}
