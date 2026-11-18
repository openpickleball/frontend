/**
 * Recording a match: create it, then confirm the score for the submitter's own team.
 *
 * The backend makes a self-submitted match pending with no confirmation, so after the
 * 201 this calls `POST matches/{code}/confirm` (Decision Q4). If that second call fails
 * the match still exists: the result says so instead of throwing, and the caller sends
 * the player to the match page anyway.
 */
import { api, toAppError, unwrap, type Api, type AppError } from '#lib/api/index.js';
import {
	groupIssues,
	parseMatchCode,
	toMatch,
	validateMatch,
	type Match,
	type MatchCode,
	type MatchInput,
	type PlayerCode
} from '#lib/domain/index.js';

export type SubmitResult = {
	/**
	 * The match as the API last returned it: after the confirmation when that worked,
	 * otherwise as it was created. T8 can put this in its match cache under `match.code`.
	 */
	match: Match;
	/** Set when the match was created but confirming the player's team failed. */
	confirmError: AppError | null;
};

export type SubmitOptions = {
	/** Another API client. For tests, which need a base URL in node. */
	api?: Api;
};

/** A problem found before sending anything, shaped like a 422 so a form maps it the same way. */
function localError(
	kind: AppError['kind'],
	code: string,
	message: string,
	fields: AppError['fields'] = {}
): AppError {
	return { kind, status: null, code, message, fields };
}

/**
 * Create the match, then confirm it for `myCode`'s team.
 *
 * Throws an `AppError`: `validation` (with `fields`) for a 422 or a draft that breaks a score
 * rule, `duplicate` for a 409 (see `duplicateMatchCode`), `network` when offline, and
 * `forbidden` if `myCode` is not one of the players (the backend refuses that with a 403
 * before it checks anything else, so it is caught here).
 */
export async function submitMatch(
	draft: MatchInput,
	myCode: PlayerCode,
	options: SubmitOptions = {}
): Promise<SubmitResult> {
	const client = options.api ?? api;

	const checked = validateMatch(draft);
	if (!checked.ok) {
		throw localError(
			'validation',
			'invalid_match',
			'Please check the highlighted fields.',
			groupIssues(checked.error)
		);
	}
	const valid = checked.value;
	if (!valid.teamA.includes(myCode) && !valid.teamB.includes(myCode)) {
		throw localError(
			'forbidden',
			'not_a_player',
			'You must be one of the players to record a match.'
		);
	}

	const created = await unwrap(
		client.open.POST('/api/v1/matches/', {
			body: {
				format: valid.format,
				played_on: valid.playedOn,
				team_a: [...valid.teamA],
				team_b: [...valid.teamB],
				games: valid.games.map((g) => ({ team_a: g.teamA, team_b: g.teamB })),
				best_of: valid.bestOf,
				game_target: valid.gameTarget,
				scoring_type: valid.scoringType
			}
		})
	);
	const createdMatch = toMatch(created);

	try {
		const confirmed = await unwrap(
			client.open.POST('/api/v1/matches/{code}/confirm', {
				params: { path: { code: createdMatch.code } }
			})
		);
		return { match: toMatch(confirmed), confirmError: null };
	} catch (cause) {
		return { match: createdMatch, confirmError: toAppError(cause) };
	}
}

/**
 * The earlier match a 409 `duplicate_match` points at. The backend puts its OPEN code in the
 * message ("This match was already submitted as M-...") when the submitter may know it, and
 * names no code otherwise. Null when the error is not a duplicate or names no match.
 */
export function duplicateMatchCode(error: AppError): MatchCode | null {
	if (error.kind !== 'duplicate' || error.code !== 'duplicate_match') return null;
	const found = /\bM(?:-?[0-9A-Z]{4}){3}\b/i.exec(error.message);
	if (!found) return null;
	const parsed = parseMatchCode(found[0]);
	return parsed.ok ? parsed.value : null;
}
