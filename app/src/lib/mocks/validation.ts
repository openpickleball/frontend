/**
 * Request validation the way ninja and pydantic do it, before any service runs.
 *
 * A pydantic error names the location (`body.games.0.team_a`), its type and pydantic's
 * message, and ninja returns all of them together as a 422 (`config/api_errors.py`).
 * The score and player rules come after this, from the domain validators
 * (`store.submitMatch`), as in the backend where `validate_match` runs inside the view.
 */
import { BEST_OF_VALUES, GAME_TARGETS, MATCH_FORMATS, SCORING_TYPES } from '../domain/models';
import type { FieldIssue } from './store';

/** The longest team and game lists the schema takes (`MAX_TEAM_ENTRIES`, `MAX_GAME_ENTRIES`). */
export const MAX_TEAM_ENTRIES = 10;
export const MAX_GAME_ENTRIES = 20;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function choices(values: readonly (string | number)[]): string {
	const words = values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v)));
	if (words.length <= 2) return words.join(' or ');
	return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

const missing = (field: string): FieldIssue => ({
	field,
	code: 'missing',
	message: 'Field required'
});

function enumIssue(field: string, values: readonly (string | number)[]): FieldIssue {
	return { field, code: 'enum', message: `Input should be ${choices(values)}` };
}

const isDate = (value: unknown): boolean => {
	if (typeof value !== 'string') return false;
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	return match !== null;
};

/** Issues in the shape of `MatchCreateIn`, or an empty list when the body is well-formed. */
export function matchCreateIssues(body: unknown): FieldIssue[] {
	if (!isObject(body)) {
		return [
			{
				field: 'body',
				code: 'model_attributes_type',
				message: 'Input should be a valid dictionary or object to extract fields from'
			}
		];
	}
	const issues: FieldIssue[] = [];

	if (body.format === undefined) issues.push(missing('body.format'));
	else if (!MATCH_FORMATS.includes(body.format as never)) {
		issues.push(enumIssue('body.format', MATCH_FORMATS));
	}

	if (body.played_on === undefined) issues.push(missing('body.played_on'));
	else if (!isDate(body.played_on)) {
		issues.push({
			field: 'body.played_on',
			code: 'date_from_datetime_parsing',
			message: 'Input should be a valid date or datetime'
		});
	}

	for (const key of ['team_a', 'team_b'] as const) {
		const field = `body.${key}`;
		const value = body[key];
		if (value === undefined) issues.push(missing(field));
		else if (!Array.isArray(value)) {
			issues.push({ field, code: 'list_type', message: 'Input should be a valid list' });
		} else if (value.length > MAX_TEAM_ENTRIES) {
			issues.push({
				field,
				code: 'too_long',
				message: `Enter at most ${MAX_TEAM_ENTRIES} players for a team.`
			});
		} else {
			value.forEach((entry, index) => {
				if (typeof entry !== 'string') {
					issues.push({
						field: `${field}.${index}`,
						code: 'string_type',
						message: 'Input should be a valid string'
					});
				}
			});
		}
	}

	const games = body.games;
	if (games === undefined) issues.push(missing('body.games'));
	else if (!Array.isArray(games)) {
		issues.push({
			field: 'body.games',
			code: 'list_type',
			message: 'Input should be a valid list'
		});
	} else if (games.length > MAX_GAME_ENTRIES) {
		issues.push({
			field: 'body.games',
			code: 'too_long',
			message: `Enter at most ${MAX_GAME_ENTRIES} games.`
		});
	} else {
		games.forEach((game, index) => {
			const base = `body.games.${index}`;
			if (!isObject(game)) {
				issues.push({
					field: base,
					code: 'model_attributes_type',
					message: 'Input should be a valid dictionary or object to extract fields from'
				});
				return;
			}
			for (const side of ['team_a', 'team_b'] as const) {
				const score = game[side];
				if (score === undefined) issues.push(missing(`${base}.${side}`));
				else if (typeof score !== 'number' || !Number.isInteger(score)) {
					issues.push({
						field: `${base}.${side}`,
						code: 'int_type',
						message: 'Input should be a valid integer'
					});
				}
			}
		});
	}

	if (body.best_of != null && !BEST_OF_VALUES.includes(body.best_of as never)) {
		issues.push(enumIssue('body.best_of', BEST_OF_VALUES));
	}
	if (body.scoring_type != null && !SCORING_TYPES.includes(body.scoring_type as never)) {
		issues.push(enumIssue('body.scoring_type', SCORING_TYPES));
	}
	if (body.game_target != null && !GAME_TARGETS.includes(body.game_target as never)) {
		issues.push(enumIssue('body.game_target', GAME_TARGETS));
	}
	return issues;
}

/** The limits of `MatchHistoryPagination.Input`. */
export const HISTORY_PAGE_SIZE = 20;
export const HISTORY_MAX_PAGE_SIZE = 100;

export type PageQuery = { limit: number; offset: number };

/** Ninja's `limit` (1 to 100, default 20) and `offset` (0 or more, default 0). */
export function pageQuery(
	rawLimit: string | null,
	rawOffset: string | null
): { ok: true; value: PageQuery } | { ok: false; issues: FieldIssue[] } {
	const issues: FieldIssue[] = [];
	const read = (
		name: 'limit' | 'offset',
		raw: string | null,
		fallback: number,
		min: number,
		max?: number
	) => {
		if (raw === null) return fallback;
		const field = `query.${name}`;
		if (!/^[+-]?\d+$/.test(raw.trim())) {
			issues.push({
				field,
				code: 'int_parsing',
				message: 'Input should be a valid integer, unable to parse string as an integer'
			});
			return fallback;
		}
		const value = Number(raw);
		if (value < min) {
			issues.push({
				field,
				code: 'greater_than_equal',
				message: `Input should be greater than or equal to ${min}`
			});
		} else if (max !== undefined && value > max) {
			issues.push({
				field,
				code: 'less_than_equal',
				message: `Input should be less than or equal to ${max}`
			});
		}
		return value;
	};
	const limit = read('limit', rawLimit, HISTORY_PAGE_SIZE, 1, HISTORY_MAX_PAGE_SIZE);
	const offset = read('offset', rawOffset, 0, 0);
	return issues.length > 0 ? { ok: false, issues } : { ok: true, value: { limit, offset } };
}
