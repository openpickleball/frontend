/**
 * Recording a match: one `POST matches/`. The backend records the submitter's team
 * confirmation with the match (backend#197), so the match comes back pending on the other
 * team only.
 */
import { AppError, api, unwrap, type ApiOption } from '#lib/api/index.js';
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
	 * The match as the create call returned it, with the submitter's team confirmed. A match
	 * cache can keep it under `match.code`.
	 */
	match: Match;
};

export type SubmitOptions = ApiOption;

/** A problem found before sending anything, shaped like a 422 so a form maps it the same way. */
function localError(
	kind: AppError['kind'],
	code: string,
	message: string,
	fields: AppError['fields'] = {}
): AppError {
	return new AppError({ kind, status: null, code, message, fields });
}

/**
 * Create the match. The backend records `myCode`'s team confirmation with it.
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
			'Check the highlighted fields.',
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
	return { match: toMatch(created) };
}

/**
 * The earlier match a 409 `duplicate_match` points at. When the submitter may know it, the
 * backend names it in the error item's `existing_code` (`error.existingCode`) and in the message
 * ("This match was already submitted as M-..."). It names no code otherwise. Null when the error
 * is not a duplicate or names no valid code.
 *
 * Reads `existingCode` first. A backend older than openpickleball/backend#199 sends only the
 * message, so the code is read from the message text when `existingCode` is unset or not valid.
 */
export function duplicateMatchCode(error: AppError): MatchCode | null {
	if (error.kind !== 'duplicate' || error.code !== 'duplicate_match') return null;
	if (error.existingCode) {
		const structured = parseMatchCode(error.existingCode);
		if (structured.ok) return structured.value;
	}
	const found = /\bM(?:-?[0-9A-Z]{4}){3}\b/i.exec(error.message);
	if (!found) return null;
	const parsed = parseMatchCode(found[0]);
	return parsed.ok ? parsed.value : null;
}
