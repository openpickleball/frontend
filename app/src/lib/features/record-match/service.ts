/**
 * Recording a match: one `POST matches/`. The backend records the submitter's team
 * confirmation with the match (backend#197), so the match comes back pending on the other
 * team only.
 */
import { AppError, api, unwrap, type ApiOption } from '#lib/api/index.js';
import { offlineQueue } from '#lib/features/offline/index.js';
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
	const body = checkedBody(draft, myCode);
	const created = await unwrap(client.open.POST('/api/v1/matches/', { body }));
	return { match: toMatch(created) };
}

/**
 * Keep the match on this device and send it when the connection is back (frontend#33). `form` is
 * the form as the player filled it, so a match the backend refuses can be put back to fix. The
 * same checks as `submitMatch` run first, so only a match the backend could take is queued.
 * Rejects when the device can't store it: the match was not saved then.
 */
export async function queueMatch(
	draft: MatchInput,
	myCode: PlayerCode,
	form: unknown,
	queue: Pick<typeof offlineQueue, 'add'> = offlineQueue
): Promise<void> {
	const body = checkedBody(draft, myCode);
	await queue.add({ own: myCode, body, form });
}

/**
 * Correct a pending or disputed match with no event (`POST matches/{code}/correction`,
 * backend#267). Send the whole corrected match, with the same two teams in either order. The
 * backend voids the old match and returns the correction: a new match with a new code, pending,
 * with `myCode`'s team confirmation already recorded.
 *
 * Throws an `AppError` like `submitMatch`, plus `not_found` (404) for a match with an event or a
 * club, a match the player did not play in, or other teams, and `conflict` (409) for a match that
 * is confirmed or voided. A 403 is only ever the CSRF check.
 */
export async function correctMatch(
	code: MatchCode,
	draft: MatchInput,
	myCode: PlayerCode,
	options: SubmitOptions = {}
): Promise<SubmitResult> {
	const client = options.api ?? api;
	const body = checkedBody(draft, myCode);
	const corrected = await unwrap(
		client.open.POST('/api/v1/matches/{code}/correction', { params: { path: { code } }, body })
	);
	return { match: toMatch(corrected) };
}

/** The request body, once the draft passes the score rules and `myCode` is one of the players. */
function checkedBody(draft: MatchInput, myCode: PlayerCode) {
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
	return {
		format: valid.format,
		played_on: valid.playedOn,
		team_a: [...valid.teamA],
		team_b: [...valid.teamB],
		games: valid.games.map((g) => ({ team_a: g.teamA, team_b: g.teamB })),
		best_of: valid.bestOf,
		game_target: valid.gameTarget,
		scoring_type: valid.scoringType
	};
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
