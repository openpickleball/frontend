/**
 * Text for matches: the score line, dates and team names. Pure functions, no Svelte.
 *
 * Scores use a plain hyphen ("11-7, 9-11, 11-5") and ranges an en dash ("1–20 of 47"). No em dashes.
 */
import {
	gameWinner,
	gamesWon,
	myTeam,
	winner,
	type Match,
	type MatchStatus,
	type PlayerCode,
	type Side,
	type Team
} from '#lib/domain/index.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** `YYYY-MM-DD` as a UTC date, so no time zone moves the day. Null when it is not a date. */
function parseDay(playedOn: string): Date | null {
	const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(playedOn);
	if (!found) return null;
	const [, year, month, day] = found;
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
	if (Number.isNaN(date.getTime())) return null;
	// 31 February rolls over into March: not a date.
	return date.getUTCMonth() === Number(month) - 1 ? date : null;
}

/** "14 Nov 2026". Falls back to the text it was given. */
export function formatDate(playedOn: string): string {
	const date = parseDay(playedOn);
	if (!date) return playedOn;
	return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCFullYear()}`;
}

/** "Sat 14 Nov", for list rows. Falls back to the text it was given. */
export function formatShortDate(playedOn: string): string {
	const date = parseDay(playedOn);
	if (!date) return playedOn;
	return `${WEEKDAYS[date.getUTCDay()].slice(0, 3)} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
}

/** "Saturday 14 November 2026". */
export function formatLongDate(playedOn: string): string {
	const date = parseDay(playedOn);
	if (!date) return playedOn;
	const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
	return `${WEEKDAYS[date.getUTCDay()]} ${day}`;
}

/**
 * "11-7, 9-11, 11-5". Shown from the point of view of `from`: that side's points come first.
 * With no side, team A's come first, as recorded.
 */
export function scoreLine(match: Pick<Match, 'games'>, from: Side = 'a'): string {
	return match.games
		.map((game) => (from === 'a' ? `${game.teamA}-${game.teamB}` : `${game.teamB}-${game.teamA}`))
		.join(', ');
}

/** The points one side scored in each game, and whether it won that game. */
export function sideScores(
	match: Pick<Match, 'games'>,
	side: Side
): { points: number; won: boolean }[] {
	return match.games.map((game) => ({
		points: side === 'a' ? game.teamA : game.teamB,
		won: gameWinner(game) === side
	}));
}

/** "Won 2–1" (with an en dash): the games `side` won, then the games it lost. */
export function wonTag(match: Pick<Match, 'games'>, side: Side): string {
	const won = gamesWon(match);
	return side === 'a' ? `Won ${won.a}–${won.b}` : `Won ${won.b}–${won.a}`;
}

/**
 * Player names, such as "Tamsin Vale and Oren Quill". A private player reads "Private player".
 * Pass `you` to mark the player's own name.
 */
export function teamNames(team: Team, you?: PlayerCode | null): string {
	const names = team.players.map((player) =>
		you && player.code === you ? `${player.displayName} (you)` : player.displayName
	);
	if (names.length <= 2) return names.join(' and ');
	return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Team names for a list row, as in the mockups: "You & Oren Quill" and "Bea Marlowe & Kit Ashdown". */
export function rowTeamNames(team: Team, you: PlayerCode | null): string {
	const names = team.players.map((player) =>
		you && player.code === you ? 'You' : player.displayName
	);
	return names.join(' & ');
}

export function formatName(format: Match['format']): string {
	return format === 'singles' ? 'Singles' : 'Doubles';
}

/** "Doubles, best of 3", or "Singles, 1 game". */
export function matchTitle(match: Pick<Match, 'format' | 'bestOf'>): string {
	const games = match.bestOf === 1 ? '1 game' : `best of ${match.bestOf}`;
	return `${formatName(match.format)}, ${games}`;
}

export function scoringName(scoring: Match['scoringType']): string {
	return scoring === 'rally' ? 'Rally' : 'Side-out';
}

export const STATUS_LABELS: Record<MatchStatus, string> = {
	pending: 'Pending',
	confirmed: 'Confirmed',
	disputed: 'Disputed',
	voided: 'Voided'
};

/** The side to read the match from: the player's own, or team A when they did not play. */
export function viewpoint(match: Pick<Match, 'teamA' | 'teamB'>, you: PlayerCode | null): Side {
	return (you && myTeam(match, you)?.side) || 'a';
}

/** One sentence for a screen reader: who played, the score and the status. */
export function rowLabel(match: Match, you: PlayerCode | null): string {
	const from = viewpoint(match, you);
	const mine = from === 'a' ? match.teamA : match.teamB;
	const theirs = from === 'a' ? match.teamB : match.teamA;
	const won = winner(match);
	const verb = won === null ? 'played' : won === from ? 'beat' : 'lost to';
	return `${formatDate(match.playedOn)}, ${matchTitle(match)}. ${teamNames(mine, you)} ${verb} ${teamNames(theirs, you)}, ${scoreLine(match, from)}. ${STATUS_LABELS[match.status]}.`;
}

/** "1–20 of 47" for the page that starts at `offset` and shows `shown` matches. */
export function rangeLabel(offset: number, shown: number, count: number): string {
	if (shown === 0) return `0 of ${count}`;
	return `${offset + 1}–${offset + shown} of ${count}`;
}

/** `?page=2` is the second page of 20. Anything that is not a whole number from 1 up is page 1. */
export function pageFromSearch(search: URLSearchParams): number {
	const raw = search.get('page');
	const page = raw !== null && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
	return page >= 1 ? page : 1;
}

/** "1 match" or "47 matches". */
export function matchCountLabel(count: number): string {
	return count === 1 ? '1 match' : `${count} matches`;
}
