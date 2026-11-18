/**
 * Domain models: camelCase types the UI works with. The mappers from the API's
 * `MatchOut` and `ParticipantOut` (a later task) build these. Field names follow
 * the API's, converted to camelCase, so the mappers are renames plus `parsePlayerCode`
 * and `parseMatchCode`.
 */
import type { MatchCode, PlayerCode } from './codes';

export const MATCH_FORMATS = ['singles', 'doubles'] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number];

export const MATCH_STATUSES = ['pending', 'confirmed', 'disputed', 'voided'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const SCORING_TYPES = ['side_out', 'rally'] as const;
export type ScoringType = (typeof SCORING_TYPES)[number];

/** How many games a match is played to. */
export const BEST_OF_VALUES = [1, 3, 5] as const;
export type BestOf = (typeof BEST_OF_VALUES)[number];

/** The points a game is played to. */
export const GAME_TARGETS = [11, 15, 21] as const;
export type GameTarget = (typeof GAME_TARGETS)[number];

/** The most games a match can have. */
export const MAX_GAMES = 5;

/** The two sides of a match. */
export type Side = 'a' | 'b';

/**
 * A player in a match. `code` is null for a private player (an inactive account),
 * whose name the API replaces with "Private player".
 */
export type Player = {
	code: PlayerCode | null;
	displayName: string;
};

export type Team = {
	side: Side;
	players: readonly Player[];
};

/** One game's points. `number` starts at 1. */
export type Game = {
	number: number;
	teamA: number;
	teamB: number;
};

export type Match = {
	code: MatchCode;
	status: MatchStatus;
	format: MatchFormat;
	/** The date played, `YYYY-MM-DD`. Kept as text so no time zone shifts it. */
	playedOn: string;
	bestOf: BestOf;
	scoringType: ScoringType;
	gameTarget: GameTarget;
	teamA: Team;
	teamB: Team;
	games: readonly Game[];
};

export function isPrivatePlayer(player: Player): boolean {
	return player.code === null;
}

export function otherSide(side: Side): Side {
	return side === 'a' ? 'b' : 'a';
}

export function teamOn(match: Match, side: Side): Team {
	return side === 'a' ? match.teamA : match.teamB;
}

/** The side that won a game, or null for a tie (which the backend refuses). */
export function gameWinner(game: Pick<Game, 'teamA' | 'teamB'>): Side | null {
	if (game.teamA === game.teamB) return null;
	return game.teamA > game.teamB ? 'a' : 'b';
}

/** Games won by each side. */
export function gamesWon(match: Pick<Match, 'games'>): { a: number; b: number } {
	const won = { a: 0, b: 0 };
	for (const game of match.games) {
		const side = gameWinner(game);
		if (side) won[side] += 1;
	}
	return won;
}

/** The side that won the match: the first to win more than half of `bestOf`. Null while undecided. */
export function winner(match: Pick<Match, 'games' | 'bestOf'>): Side | null {
	const needed = Math.floor(match.bestOf / 2) + 1;
	const won = gamesWon(match);
	if (won.a >= needed) return 'a';
	if (won.b >= needed) return 'b';
	return null;
}

/** The team that has the player with `myCode`, or null when they did not play. */
export function myTeam(match: Pick<Match, 'teamA' | 'teamB'>, myCode: PlayerCode): Team | null {
	for (const team of [match.teamA, match.teamB]) {
		if (team.players.some((player) => player.code === myCode)) return team;
	}
	return null;
}

/** True while the match waits for confirmation. */
export function isPending(match: Pick<Match, 'status'>): boolean {
	return match.status === 'pending';
}

/** Whether the player with `myCode` won. Null when they did not play or the match is undecided. */
export function didWin(match: Match, myCode: PlayerCode): boolean | null {
	const mine = myTeam(match, myCode);
	const won = winner(match);
	if (!mine || !won) return null;
	return mine.side === won;
}
