/**
 * Domain models: camelCase types the UI works with. The mappers from the API's
 * `MatchOut` and `ParticipantOut` (`mappers.ts`) build these. Field names follow
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

/**
 * The Event a match was recorded under (`MatchEventOut`). `organizer` is the Event's organizer's
 * OPEN code. The organizer's name is never sent, read or shown.
 */
export type MatchEvent = {
	code: string;
	name: string;
	organizer: string;
};

/** The Club a match names (`MatchClubOut`). */
export type MatchClub = {
	code: string;
	name: string;
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
	/** The signed-in player's side, or null when they did not play. */
	viewerSide: Side | null;
	/**
	 * The latest confirm, dispute or withdraw the signed-in player recorded, `none` if there is
	 * none. `withdraw` means they withdrew their dispute. The match can still be disputed by
	 * another player.
	 */
	viewerDecision: 'confirm' | 'dispute' | 'withdraw' | 'none';
	/**
	 * Whether any player on each side has confirmed. A dispute is not a confirmation, and a
	 * confirmation stays after the same player disputes or withdraws. A match an organizer
	 * confirmed, or a corrected match, can show both sides false, so read `status` for whether the
	 * match is confirmed. Null when the signed-in player did not play.
	 */
	confirmedBySide: { a: boolean; b: boolean } | null;
	/** When the match was submitted, an ISO time. */
	createdAt: string;
	/** The Event the match was recorded under, or null when it has none. */
	event: MatchEvent | null;
	/** The Club the match names, or null when it has none. */
	club: MatchClub | null;
};

/**
 * A held match the signed-in account may vouch for (`HoldOut`). A possible duplicate hold keeps
 * a match from counting when another match has the same teams and date with other scores. The
 * API never names that other match. `MatchOut` has no hold field, so only the holds list says a
 * match is held. `vouched` is true when the account's own side has vouched on every open hold of
 * the match: a player on their team for a match with no event, or the event's organizer.
 */
export type Hold = {
	match: Match;
	vouched: boolean;
};

export function otherSide(side: Side): Side {
	return side === 'a' ? 'b' : 'a';
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

/** True while the match waits for confirmation. */
export function isPending(match: Pick<Match, 'status'>): boolean {
	return match.status === 'pending';
}

/**
 * True when the signed-in player played in a pending match and no one on their team has confirmed
 * it. These are the matches that need them.
 */
export function needsViewerConfirmation(
	match: Pick<Match, 'status' | 'viewerSide' | 'confirmedBySide'>
): boolean {
	if (match.status !== 'pending' || !match.viewerSide || !match.confirmedBySide) return false;
	return !match.confirmedBySide[match.viewerSide];
}

/**
 * True when the signed-in player's team has confirmed a pending match and the other team has not.
 */
export function waitingOnOtherTeam(
	match: Pick<Match, 'status' | 'viewerSide' | 'confirmedBySide'>
): boolean {
	if (match.status !== 'pending' || !match.viewerSide || !match.confirmedBySide) return false;
	return (
		match.confirmedBySide[match.viewerSide] && !match.confirmedBySide[otherSide(match.viewerSide)]
	);
}

/** The kinds of Event, as the API names them (`EventKind`). */
export const EVENT_KINDS = ['tournament', 'league', 'rec_verified'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Each kind of Event in plain words. */
export const EVENT_KIND_LABELS: Record<EventKind, string> = {
	tournament: 'Tournament',
	league: 'League',
	rec_verified: 'Verified rec play'
};

/**
 * An Event an organizer runs (`EventOut`). Not named `Event`, which is the DOM's type.
 * `organizer` and `club` are OPEN codes, which the app shows but does not parse.
 */
export type OrganizerEvent = {
	code: string;
	name: string;
	kind: EventKind;
	organizer: string;
	club: string | null;
	/** `YYYY-MM-DD`. Kept as text so no time zone shifts it. */
	startDate: string;
	/** `YYYY-MM-DD`. */
	endDate: string;
};
