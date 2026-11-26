import { api, isAppError, unwrap, type ApiOption, type AppError } from '#lib/api/index.js';
import { parseMatchCode, toMatch, type Match, type MatchCode } from '#lib/domain/index.js';
import type { MatchBody, Problem } from './types.js';

/**
 * What one send of a queued match came to.
 * - `sent`: the backend recorded it (2xx). `match` is null only if the answer could not be read.
 * - `duplicate`: a 409 `duplicate_match` that names the earlier match. The backend names it only
 *   when the player sent it or played in it, so it is the player's own match, often this same one
 *   sent before the connection dropped. It counts as sent.
 * - `refused`: sending again would get the same answer. The player has to see it.
 * - `signin`: a 401. Keep it and send it once the player signs in again.
 * - `retry`: no answer, a 5xx, a 429 or a CSRF failure. Keep it and try later.
 */
export type SendOutcome =
	| { kind: 'sent'; match: Match | null }
	| { kind: 'duplicate'; code: MatchCode }
	| { kind: 'refused'; problem: Problem }
	| { kind: 'signin' }
	| { kind: 'retry'; offline: boolean };

export const REFUSED_MESSAGE =
	"We couldn't record this match. You can only record a match you played in.";
export const DUPLICATE_MESSAGE = 'This match was already recorded. Look for it in your matches.';
export const INVALID_MESSAGE = "Some details weren't accepted.";

/** The earlier match a 409 names: `existing_code`, or the code in the message on older backends. */
function namedMatch(error: AppError): MatchCode | null {
	if (error.code !== 'duplicate_match') return null;
	const structured = error.existingCode ? parseMatchCode(error.existingCode) : null;
	if (structured?.ok) return structured.value;
	const found = /\bM(?:-?[0-9A-Z]{4}){3}\b/i.exec(error.message);
	const parsed = found ? parseMatchCode(found[0]) : null;
	return parsed?.ok ? parsed.value : null;
}

/** Map a failed send onto what the queue does with it. */
export function outcomeOf(error: unknown): SendOutcome {
	if (!isAppError(error)) return { kind: 'retry', offline: false };
	switch (error.kind) {
		case 'network':
			return { kind: 'retry', offline: true };
		case 'server':
		case 'throttled':
		case 'csrf':
			return { kind: 'retry', offline: false };
		case 'unauthenticated':
			return { kind: 'signin' };
		case 'duplicate': {
			const code = namedMatch(error);
			if (code) return { kind: 'duplicate', code };
			return {
				kind: 'refused',
				problem: { kind: 'duplicate', message: DUPLICATE_MESSAGE, fields: {} }
			};
		}
		case 'validation':
			return {
				kind: 'refused',
				problem: {
					kind: 'invalid',
					message: Object.keys(error.fields).length > 0 ? INVALID_MESSAGE : error.message,
					fields: error.fields
				}
			};
		case 'forbidden':
			return {
				kind: 'refused',
				problem: { kind: 'refused', message: REFUSED_MESSAGE, fields: {} }
			};
		default:
			// not_found, conflict: the backend's answer won't change by sending again.
			return { kind: 'refused', problem: { kind: 'refused', message: error.message, fields: {} } };
	}
}

/** Send one queued match with `POST matches/`. Never throws. */
export async function sendQueued(body: MatchBody, options: ApiOption = {}): Promise<SendOutcome> {
	const client = options.api ?? api;
	let created;
	try {
		created = await unwrap(client.open.POST('/api/v1/matches/', { body }));
	} catch (error) {
		return outcomeOf(error);
	}
	try {
		return { kind: 'sent', match: toMatch(created) };
	} catch {
		// The backend has it. A match we can't read is still sent.
		return { kind: 'sent', match: null };
	}
}
