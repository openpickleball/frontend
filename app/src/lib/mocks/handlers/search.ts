import { openHttp as http } from '../http';
import { ninjaError, unauthorized, validationError } from '../responses';
import type { FieldIssue, MockStore } from '../store';

/**
 * `GET /api/v1/players/search`, after `apps/players/api.py` in the backend:
 *
 * - signed-in accounts only (a 401 before anything else, so before the throttle),
 * - `q` is stripped, then 3 to 64 characters with no control characters; `limit` is 1 to 20,
 * - a name matches when it starts with `q`, or a word after a space or hyphen does, in any case,
 * - names that start with `q` come first, then by name, then by OPEN code,
 * - players whose account is inactive never appear,
 * - 30 searches a minute for each account, then a 429 with `Retry-After`.
 *
 * A 422 never repeats the search text. Kept apart from `open.ts`: only `all` mode serves it,
 * because the real backend has this endpoint.
 */
export const SEARCH_PER_MINUTE = 30;
const MIN_QUERY = 3;
const MAX_QUERY = 64;
const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;

export type SearchOptions = {
	/** Searches allowed in a minute. */
	perMinute?: number;
	/** The clock, in milliseconds. */
	now?: () => number;
};

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function issues(q: string | null, limit: string | null): FieldIssue[] {
	const found: FieldIssue[] = [];
	if (q === null) {
		found.push({ field: 'query.q', code: 'missing', message: 'Field required' });
	} else if (q.length < MIN_QUERY) {
		found.push({
			field: 'query.q',
			code: 'string_too_short',
			message: `String should have at least ${MIN_QUERY} characters`
		});
	} else if (q.length > MAX_QUERY) {
		found.push({
			field: 'query.q',
			code: 'string_too_long',
			message: `String should have at most ${MAX_QUERY} characters`
		});
	} else if (CONTROL.test(q)) {
		found.push({
			field: 'query.q',
			code: 'value_error',
			message: 'The search cannot contain control characters.'
		});
	}
	if (limit !== null) {
		if (!/^\d+$/.test(limit)) {
			found.push({
				field: 'query.limit',
				code: 'int_parsing',
				message: 'Input should be a valid integer'
			});
		} else if (Number(limit) < 1) {
			found.push({
				field: 'query.limit',
				code: 'greater_than_equal',
				message: 'Input should be greater than or equal to 1'
			});
		} else if (Number(limit) > MAX_LIMIT) {
			found.push({
				field: 'query.limit',
				code: 'less_than_equal',
				message: `Input should be less than or equal to ${MAX_LIMIT}`
			});
		}
	}
	return found;
}

/** Does the name start with `q`, or a word after a space or hyphen? Both sides in upper case. */
function matches(name: string, q: string): boolean {
	if (name.startsWith(q)) return true;
	for (let i = 1; i < name.length; i++) {
		if ((name[i - 1] === ' ' || name[i - 1] === '-') && name.startsWith(q, i)) return true;
	}
	return false;
}

export function createSearchHandlers(store: MockStore, options: SearchOptions = {}) {
	const perMinute = options.perMinute ?? SEARCH_PER_MINUTE;
	const now = options.now ?? Date.now;
	/** Each account has its own minute. */
	const windows = new Map<string, { start: number; used: number }>();

	return [
		http.get('/api/v1/players/search', ({ request, response }) => {
			const account = store.currentAccount();
			if (!account) return response.untyped(unauthorized());

			const at = now();
			let slot = windows.get(account.email);
			if (!slot || at - slot.start >= 60_000) {
				slot = { start: at, used: 0 };
				windows.set(account.email, slot);
			}
			if (slot.used >= perMinute) {
				const wait = Math.max(1, Math.ceil((slot.start + 60_000 - at) / 1000));
				const throttled = ninjaError(429, 'throttled', 'Too many requests.');
				throttled.headers.set('Retry-After', String(wait));
				return response.untyped(throttled);
			}
			slot.used += 1;

			const params = new URL(request.url).searchParams;
			const q = params.get('q')?.trim() ?? null;
			const problems = issues(q, params.get('limit'));
			if (q === null || problems.length > 0) return response.untyped(validationError(problems));
			const limit = Number(params.get('limit') ?? DEFAULT_LIMIT);

			const wanted = q.toUpperCase();
			const starts = (name: string) => name.toUpperCase().startsWith(wanted);
			const active = new Set(store.state.accounts.filter((a) => a.active).map((a) => a.email));
			const items = store.state.players
				.filter((p) => p.accountEmail !== null && active.has(p.accountEmail))
				.filter((p) => matches(p.displayName.toUpperCase(), wanted))
				.sort(
					(a, b) =>
						Number(starts(b.displayName)) - Number(starts(a.displayName)) ||
						a.displayName.localeCompare(b.displayName) ||
						a.code.localeCompare(b.code)
				)
				.slice(0, limit)
				.map((p) => ({ code: p.code, display_name: p.displayName }));
			return response(200).json({ items });
		})
	];
}
