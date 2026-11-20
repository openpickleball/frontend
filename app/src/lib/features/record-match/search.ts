/**
 * Finding a player by display name, for the player slots of the record form.
 *
 * `searchPlayers` calls `GET /api/v1/players/search` and answers with a result, never a throw,
 * for every failure the form words itself: a bad query (422), too many searches (429, with the
 * wait from `Retry-After`), a lapsed sign-in (401) and the rest. Only a cancelled request throws, so the caller can
 * tell "stale" from "failed". Names and codes in results come from the backend as is.
 */
import { api, toAppError, type ApiOption } from '#lib/api/index.js';
import { ALPHABET, parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';

/** The shortest search the backend takes. */
export const MIN_SEARCH_LENGTH = 3;
/** The most results the form asks for. */
export const SEARCH_LIMIT = 10;

/** A player found by name. Nothing else about them is shown. */
export type PlayerHit = { code: PlayerCode; name: string };

export type SearchFailure = 'invalid' | 'throttled' | 'signed-out' | 'offline' | 'other';

export type SearchResult =
	| { ok: true; items: PlayerHit[] }
	| {
			ok: false;
			kind: SearchFailure;
			/** Seconds to wait, when the backend said so on a 429. */
			retryAfter: number | null;
	  };

export type SearchOptions = ApiOption & {
	/** Cancels the request. A cancelled search rejects with an `AbortError`. */
	signal?: AbortSignal;
};

export type SearchFn = (query: string, options?: SearchOptions) => Promise<SearchResult>;

/** `Retry-After` as whole seconds. The date form is not used by the backend, so it counts as unknown. */
export function parseRetryAfter(value: string | null): number | null {
	if (value === null || !/^\d{1,7}$/.test(value.trim())) return null;
	return Number(value.trim());
}

export const searchPlayers: SearchFn = async (query, options = {}) => {
	const client = options.api ?? api;
	const text = query.trim();
	if (text.length < MIN_SEARCH_LENGTH) return { ok: false, kind: 'invalid', retryAfter: null };

	let result;
	try {
		result = await client.open.GET('/api/v1/players/search', {
			params: { query: { q: text, limit: SEARCH_LIMIT } },
			signal: options.signal
		});
	} catch (cause) {
		if (options.signal?.aborted) throw cause;
		const kind = toAppError(cause).kind === 'network' ? 'offline' : 'other';
		return { ok: false, kind, retryAfter: null };
	}

	if (!result.response.ok) {
		const status = result.response.status;
		if (status === 429) {
			return {
				ok: false,
				kind: 'throttled',
				retryAfter: parseRetryAfter(result.response.headers.get('Retry-After'))
			};
		}
		const kind = status === 422 ? 'invalid' : status === 401 ? 'signed-out' : 'other';
		return { ok: false, kind, retryAfter: null };
	}

	const items: PlayerHit[] = [];
	for (const item of result.data?.items ?? []) {
		const code = parsePlayerCode(item.code);
		if (code.ok && item.display_name.trim() !== '') {
			items.push({ code: code.value, name: item.display_name });
		}
	}
	return { ok: true, items };
};

/** How long to wait, in a few plain words: "in a minute", "in 20 seconds", "in 2 hours". */
export function waitText(seconds: number | null): string {
	if (seconds === null || seconds <= 0) return 'in a minute';
	if (seconds < 45) return `in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
	if (seconds <= 90) return 'in a minute';
	if (seconds < 3600) return `in ${Math.ceil(seconds / 60)} minutes`;
	const hours = Math.ceil(seconds / 3600);
	return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** The longest player code without its hyphens and spaces: the P and eight characters. */
const CODE_LENGTH = 9;

/**
 * Does this text look like an OPEN code, whole or part? Then it is not searched as a name.
 *
 * It must use only characters a code has (the OPEN alphabet, hyphens and spaces), be no longer
 * than a code, and have a digit, or start with "P-" and have no space. So "P-7K3M", "P-JH" and
 * "7k3m qx9h" are codes, while "P Smith", "P-J Harvey" and "Jo3" are names.
 */
export function looksLikeCode(text: string): boolean {
	const t = text.trim().toUpperCase();
	const compact = t.replaceAll('-', '').replaceAll(' ', '');
	if (compact === '' || compact.length > CODE_LENGTH) return false;
	if ([...compact].some((char) => !ALPHABET.includes(char))) return false;
	return /\d/.test(t) || (t.startsWith('P-') && !t.includes(' '));
}
