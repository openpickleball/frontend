/**
 * Score rules for a submitted match.
 *
 * A port of backend `apps/matches/services.py` (`validate_match`, `_game_issue`,
 * `infer_best_of`). The backend is the authority and re-checks every submission:
 * these rules exist to show problems before the request is sent. Each issue has
 * the field, code and message shape of the backend's `FieldError`, and the same
 * field names the backend reports in a 422 once `body.` is stripped:
 * `format`, `team_a`, `team_b`, `team_a.<i>`, `games`, `games.<i>` (0-based),
 * `played_on`, `best_of`, `game_target`, `scoring_type`.
 *
 * Differences from the backend, all about what a browser can know:
 * - A code that is not a valid player code is reported as `invalid_code` at
 *   `team_a.<i>`. The backend says `unknown_player` for that and for a valid code
 *   no player has, which only it can check.
 * - The backend reports bad codes alone, before it runs the other rules. Here
 *   every issue is reported together.
 * - The backend's `mixed_player_references` cannot happen: every player here is a
 *   code string.
 * - JavaScript has no integer/float split, so `11.0` is the integer 11.
 */
import { parsePlayerCode, type PlayerCode } from './codes';
import {
	BEST_OF_VALUES,
	GAME_TARGETS,
	MATCH_FORMATS,
	MAX_GAMES,
	SCORING_TYPES,
	type BestOf,
	type GameTarget,
	type MatchFormat,
	type ScoringType,
	type Side
} from './models';
import { err, ok, type Result } from './result';

/** The margin a game is won by. */
export const WIN_MARGIN = 2;
/** The game target when none is given. */
export const DEFAULT_GAME_TARGET: GameTarget = 11;
/** The scoring type when none is given. */
export const DEFAULT_SCORING_TYPE: ScoringType = 'side_out';
/** The highest UTC offset anywhere on Earth, in minutes (UTC+14). */
const MAX_UTC_OFFSET_MINUTES = 840;

const PLAYERS_PER_TEAM: Record<MatchFormat, number> = { singles: 1, doubles: 2 };

/** One problem with a submission, keyed by the field it belongs to. */
export type Issue = { field: string; code: string; message: string };

/** Messages by field key, for forms. */
export type FieldErrors = Record<string, string[]>;

export function groupIssues(issues: readonly Issue[]): FieldErrors {
	const grouped: FieldErrors = {};
	for (const issue of issues) {
		(grouped[issue.field] ??= []).push(issue.message);
	}
	return grouped;
}

export type GameScore = { teamA: number; teamB: number };

/**
 * A match as the form holds it. Every value is `unknown` so the rules can face
 * anything a form or a test hands them, as the backend's rules face anything an
 * API client sends. A well-typed `MatchInput` is assignable to it.
 */
export type MatchDraft = {
	format?: unknown;
	playedOn?: unknown;
	teamA?: unknown;
	teamB?: unknown;
	games?: unknown;
	bestOf?: unknown;
	gameTarget?: unknown;
	scoringType?: unknown;
};

/** A submission that passed, with defaults filled in and the best-of inferred. */
export type ValidatedMatch = {
	format: MatchFormat;
	playedOn: string;
	teamA: readonly PlayerCode[];
	teamB: readonly PlayerCode[];
	games: readonly GameScore[];
	bestOf: BestOf;
	gameTarget: GameTarget;
	scoringType: ScoringType;
};

function orList(items: readonly (string | number)[]): string {
	const words = items.map(String);
	if (words.length <= 2) return words.join(' or ');
	return `${words.slice(0, -1).join(', ')}, or ${words[words.length - 1]}`;
}

const FORMAT_CHOICE = `Choose a format of ${orList(MATCH_FORMATS)}.`;
const SCORING_CHOICE = 'Choose a scoring type of side-out or rally.';
const TARGET_CHOICE = `Choose a game target of ${orList(GAME_TARGETS)}.`;
const BEST_OF_CHOICE = `Choose a best-of of ${orList(BEST_OF_VALUES)}.`;
const CANNOT_INFER = `The games do not decide a best of ${orList(BEST_OF_VALUES)} match.`;

function isInt(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

function isOneOf<T extends string | number>(values: readonly T[], value: unknown): value is T {
	return (values as readonly unknown[]).includes(value);
}

/**
 * Checks one game. `index` is the game's 0-based place in the match, for the field
 * key and message. With a `target`, the winner must reach it, win by 2 at the
 * target, and past the target win by exactly 2. With `null`, only the checks that
 * need no target run (shape, negative scores, ties).
 */
export function validateGame(
	game: unknown,
	target: GameTarget | null,
	index = 0
): Result<GameScore, Issue> {
	const field = `games.${index}`;
	const number = index + 1;
	if (typeof game !== 'object' || game === null) {
		return err({
			field,
			code: 'invalid_score',
			message: `Game ${number}: enter two scores as whole numbers.`
		});
	}
	const { teamA: a, teamB: b } = game as Record<string, unknown>;
	if (!isInt(a) || !isInt(b)) {
		return err({
			field,
			code: 'invalid_score',
			message: `Game ${number}: enter each score as a whole number.`
		});
	}
	if (a < 0 || b < 0) {
		return err({
			field,
			code: 'negative_score',
			message: `Game ${number}: scores cannot be negative.`
		});
	}
	if (a === b) {
		return err({ field, code: 'tie', message: `Game ${number} cannot end in a tie.` });
	}
	if (target !== null) {
		const high = Math.max(a, b);
		const low = Math.min(a, b);
		if (high < target) {
			return err({
				field,
				code: 'target_not_reached',
				message: `Game ${number}: the winner must reach the game target.`
			});
		}
		if (high === target && high - low < WIN_MARGIN) {
			return err({
				field,
				code: 'not_won_by_two',
				message: `Game ${number}: the winner must win by ${WIN_MARGIN} points.`
			});
		}
		if (high > target && high - low !== WIN_MARGIN) {
			return err({
				field,
				code: 'played_past_target',
				message: `Game ${number}: a game played past the target ends when one team leads by ${WIN_MARGIN}.`
			});
		}
	}
	return ok({ teamA: a, teamB: b });
}

/** The index of the game that decides the match, or null if none does. */
function decidingGame(winners: readonly Side[], bestOf: number): number | null {
	const needed = Math.floor(bestOf / 2) + 1;
	const wins = { a: 0, b: 0 };
	for (let index = 0; index < winners.length; index++) {
		wins[winners[index]] += 1;
		if (wins[winners[index]] === needed) return index;
	}
	return null;
}

/**
 * The smallest best-of the games decide, with no game after the decision.
 * `winners` is each game's winning side in order. Null when no allowed best-of fits.
 */
export function inferBestOf(winners: readonly Side[]): BestOf | null {
	if (winners.length === 0) return null;
	for (const bestOf of BEST_OF_VALUES) {
		if (decidingGame(winners, bestOf) === winners.length - 1) return bestOf;
	}
	return null;
}

function teamIssues(
	format: MatchFormat | null,
	teamA: unknown,
	teamB: unknown
): { issues: Issue[]; a: PlayerCode[] | null; b: PlayerCode[] | null } {
	const issues: Issue[] = [];
	const parsed: Record<'team_a' | 'team_b', PlayerCode[] | null> = { team_a: null, team_b: null };
	// Entries of each team that are usable codes, for the size and duplicate checks.
	const sizes: Record<'team_a' | 'team_b', number | null> = { team_a: null, team_b: null };
	const teams = [
		['team_a', 'Team A', teamA],
		['team_b', 'Team B', teamB]
	] as const;

	for (const [field, label, team] of teams) {
		if (!Array.isArray(team)) {
			issues.push({ field, code: 'invalid', message: `Enter ${label} as a list of players.` });
			continue;
		}
		if (team.some((entry) => typeof entry !== 'string')) {
			issues.push({
				field,
				code: 'invalid_player',
				message: `${label} lists a player that is not valid.`
			});
			continue;
		}
		const codes: PlayerCode[] = [];
		team.forEach((entry: string, index) => {
			const result = parsePlayerCode(entry);
			if (result.ok) {
				codes.push(result.value);
			} else {
				issues.push({
					field: `${field}.${index}`,
					code: 'invalid_code',
					message: result.error.message
				});
			}
		});
		parsed[field] = codes;
		sizes[field] = team.length;
	}

	for (const [field, label] of teams) {
		const members = parsed[field];
		const size = sizes[field];
		if (members === null || size === null) continue;
		if (format !== null) {
			const wanted = PLAYERS_PER_TEAM[format];
			if (size !== wanted) {
				issues.push({
					field,
					code: 'team_size',
					message: `${label} must have ${wanted} ${wanted === 1 ? 'player' : 'players'} in ${format}.`
				});
			}
		}
		if (new Set(members).size !== members.length) {
			issues.push({
				field,
				code: 'duplicate_player',
				message: `${label} lists a player more than once.`
			});
		}
	}

	const a = parsed.team_a;
	const b = parsed.team_b;
	if (a !== null && b !== null && a.some((code) => b.includes(code))) {
		issues.push({
			field: 'team_b',
			code: 'player_on_both_teams',
			message: 'A player cannot be on both teams.'
		});
	}
	return { issues, a, b };
}

/** The latest local date anywhere on Earth at `now`, as `YYYY-MM-DD`. */
export function latestPlayableDate(now: Date): string {
	return new Date(now.getTime() + MAX_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Today in the player's own time zone, as `YYYY-MM-DD`. */
export function todayLocal(now: Date = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${String(now.getFullYear()).padStart(4, '0')}-${month}-${day}`;
}

function isCalendarDate(text: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (!match) return false;
	if (Number(match[1]) < 1) return false;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(Date.UTC(year, month - 1, day));
	// Date.UTC maps years 0 to 99 to 1900 to 1999, so set the year explicitly.
	date.setUTCFullYear(year);
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

function playedOnIssue(playedOn: unknown, now: Date): Issue | null {
	if (typeof playedOn !== 'string' || !isCalendarDate(playedOn)) {
		return { field: 'played_on', code: 'invalid', message: 'Enter the date played as a date.' };
	}
	if (playedOn > latestPlayableDate(now)) {
		return {
			field: 'played_on',
			code: 'future_date',
			message: 'The date played cannot be in the future.'
		};
	}
	return null;
}

/**
 * Checks a match against every rule and returns it with defaults applied, or
 * every issue found. `now` is the current time, for the "not in the future" rule.
 */
export function validateMatch(
	draft: MatchDraft,
	now: Date = new Date()
): Result<ValidatedMatch, Issue[]> {
	const issues: Issue[] = [];

	let format: MatchFormat | null = null;
	if (isOneOf(MATCH_FORMATS, draft.format)) {
		format = draft.format;
	} else {
		issues.push({ field: 'format', code: 'invalid_choice', message: FORMAT_CHOICE });
	}
	const teams = teamIssues(format, draft.teamA, draft.teamB);
	issues.push(...teams.issues);

	let scoring: ScoringType | null = DEFAULT_SCORING_TYPE;
	if (draft.scoringType != null) {
		if (isOneOf(SCORING_TYPES, draft.scoringType)) {
			scoring = draft.scoringType;
		} else {
			scoring = null;
			issues.push({ field: 'scoring_type', code: 'invalid_choice', message: SCORING_CHOICE });
		}
	}

	let target: GameTarget | null = DEFAULT_GAME_TARGET;
	if (draft.gameTarget != null) {
		if (isOneOf(GAME_TARGETS, draft.gameTarget)) {
			target = draft.gameTarget;
		} else {
			target = null;
			issues.push({ field: 'game_target', code: 'invalid_choice', message: TARGET_CHOICE });
		}
	}

	let chosenBestOf: BestOf | null = null;
	let bestOfValid = true;
	if (draft.bestOf != null) {
		if (isOneOf(BEST_OF_VALUES, draft.bestOf)) {
			chosenBestOf = draft.bestOf;
		} else {
			bestOfValid = false;
			issues.push({ field: 'best_of', code: 'invalid_choice', message: BEST_OF_CHOICE });
		}
	}

	const scores: GameScore[] = [];
	let gamesValid = true;
	if (!Array.isArray(draft.games)) {
		gamesValid = false;
		issues.push({
			field: 'games',
			code: 'invalid',
			message: 'Enter the games as a list of scores.'
		});
	} else if (draft.games.length === 0) {
		gamesValid = false;
		issues.push({ field: 'games', code: 'no_games', message: 'Enter at least one game.' });
	} else if (draft.games.length > MAX_GAMES) {
		// One issue, not one per game of an oversized list.
		gamesValid = false;
		issues.push({
			field: 'games',
			code: 'too_many_games',
			message: `Enter at most ${MAX_GAMES} games.`
		});
	} else {
		draft.games.forEach((game: unknown, index) => {
			const result = validateGame(game, target, index);
			if (result.ok) {
				scores.push(result.value);
			} else {
				gamesValid = false;
				issues.push(result.error);
			}
		});
	}
	if (target === null) {
		// Without a valid target the games' outcome cannot be trusted.
		gamesValid = false;
	}

	if (gamesValid && bestOfValid) {
		const winners: Side[] = scores.map((score) => (score.teamA > score.teamB ? 'a' : 'b'));
		if (chosenBestOf === null) {
			chosenBestOf = inferBestOf(winners);
			if (chosenBestOf === null) {
				issues.push({ field: 'best_of', code: 'cannot_infer', message: CANNOT_INFER });
			}
		} else {
			const deciding = decidingGame(winners, chosenBestOf);
			if (deciding === null) {
				issues.push({
					field: 'games',
					code: 'not_decided',
					message: 'The games do not decide the match.'
				});
			} else if (deciding < winners.length - 1) {
				const after = deciding + 1;
				issues.push({
					field: `games.${after}`,
					code: 'game_after_decided',
					message: `Game ${after + 1} was played after the match was decided.`
				});
			}
		}
	}

	const dateIssue = playedOnIssue(draft.playedOn, now);
	if (dateIssue) issues.push(dateIssue);

	if (
		issues.length > 0 ||
		format === null ||
		teams.a === null ||
		teams.b === null ||
		scoring === null ||
		target === null ||
		chosenBestOf === null
	) {
		// Each null above always comes with an issue.
		return err(issues);
	}
	return ok({
		format,
		playedOn: draft.playedOn as string,
		teamA: teams.a,
		teamB: teams.b,
		games: scores,
		bestOf: chosenBestOf,
		gameTarget: target,
		scoringType: scoring
	});
}
