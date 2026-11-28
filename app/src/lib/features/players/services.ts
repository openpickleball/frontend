import {
	api as appApi,
	isAppError,
	toAppError,
	unwrap,
	type ApiOption,
	type OpenComponents
} from '#lib/api/index.js';
import { parsePlayerCode } from '#lib/domain/index.js';
import { HISTORY_PAGE_SIZE, toPlayerRatings, toRatingHistoryPage } from './ratings.js';
import type {
	MyPlayer,
	MySettings,
	MySettingsChange,
	PlayerRatings,
	PrivacyKey,
	RatingHistoryPage
} from './types.js';

type MyPlayerOut = OpenComponents['schemas']['MyPlayerOut'];
type FieldError = OpenComponents['schemas']['FieldError'];
export type PlayerCreateIn = OpenComponents['schemas']['PlayerCreateIn'];
type PlayerUpdateIn = OpenComponents['schemas']['PlayerUpdateIn'];
type PrivacyIn = OpenComponents['schemas']['PrivacyIn'];

function isMissing(error: unknown): boolean {
	return isAppError(error) && (error.status === 404 || error.status === 405);
}

/**
 * The backend's `UNDER_MINIMUM_AGE_MESSAGE` (`apps/players/models.py`): the one message of the age
 * refusal, the only thing that tells it from another birth month error. If the backend changes
 * it, the refusal shows as a field error under Month instead.
 */
export const AGE_REFUSAL_MESSAGE = "This birth year and month can't be used.";

/** A player code the backend sent that does not parse is a server fault. */
function toMyPlayer(dto: MyPlayerOut): MyPlayer {
	const code = parsePlayerCode(dto.code);
	if (!code.ok) throw toAppError(new Error(`me/player sent a code that does not parse`));
	return { code: code.value, displayName: dto.display_name };
}

/**
 * The signed-in account's own player. `'none'` when the account has no player yet (a 404).
 * Throws an `AppError` for anything else, including a 401 when nobody is signed in.
 */
export async function fetchMyPlayer({ api = appApi }: ApiOption = {}): Promise<MyPlayer | 'none'> {
	try {
		return toMyPlayer(await unwrap(api.open.GET('/api/v1/me/player')));
	} catch (error) {
		if (isAppError(error) && error.status === 404) return 'none';
		throw error;
	}
}

export type CreateMyPlayerResult =
	| { kind: 'created'; player: MyPlayer }
	/** The account has a player already (409). Read it again with `fetchMyPlayer`. */
	| { kind: 'conflict' }
	/**
	 * A 422 naming a missing detail: the backend holds none from sign-up and needs the body.
	 * A message per field (`first_name`, `birth_year` and so on).
	 */
	| { kind: 'needs-details'; fields: Record<string, string> }
	/**
	 * A 422 with nothing missing: the values were refused. With details held from sign-up the
	 * backend ignores the body, so sending other values may not help.
	 */
	| { kind: 'invalid'; fields: Record<string, string> }
	/** The age refusal. It holds for the rest of the session. */
	| { kind: 'refused' };

function isAgeRefusal(items: FieldError[]): boolean {
	return (
		items.length === 1 &&
		items[0].field === 'body.birth_month' &&
		items[0].code === 'invalid' &&
		items[0].message === AGE_REFUSAL_MESSAGE
	);
}

/**
 * Create the signed-in account's player with `POST me/player` (backend#124). The backend uses
 * the details held from sign-up when it has them and ignores the body; otherwise the body must
 * carry the first and last name, birth year and month and gender division. Throws an `AppError` for
 * anything not in the result: a 401, a 403 (email not verified), a 404 or 405, a 5xx or no
 * answer.
 */
export async function createMyPlayer(
	body: PlayerCreateIn = {},
	{ api = appApi }: ApiOption = {}
): Promise<CreateMyPlayerResult> {
	const post = () => api.open.POST('/api/v1/me/player', { body });
	let result: Awaited<ReturnType<typeof post>>;
	try {
		result = await post();
	} catch (cause) {
		throw toAppError(cause);
	}
	const { data, error, response } = result;
	if (response.ok && data) return { kind: 'created', player: toMyPlayer(data) };
	switch (response.status) {
		case 409:
			return { kind: 'conflict' };
		case 422: {
			// `AppError.fields` drops each item's code, so read the items here.
			const items = (error as { errors?: FieldError[] } | undefined)?.errors ?? [];
			if (isAgeRefusal(items)) return { kind: 'refused' };
			const fields: Record<string, string> = {};
			for (const [field, messages] of Object.entries(toAppError(error, response).fields)) {
				fields[field] = messages.join(' ');
			}
			const missing = items.some((item) => item.code === 'missing');
			return { kind: missing ? 'needs-details' : 'invalid', fields };
		}
	}
	throw toAppError(error, response);
}

/** The backend's name for a privacy setting, as `PrivacyIn` and its 422s name it. */
export function privacyField(key: PrivacyKey): keyof PrivacyIn {
	return key === 'name' ? 'name_format' : `${key}_visibility`;
}

function toMySettings(dto: MyPlayerOut): MySettings {
	const p = dto.privacy;
	return {
		displayName: dto.display_name,
		nameLocked: dto.name_format_locked,
		privacy: {
			match_history: p.match_history_visibility,
			stats: p.stats_visibility,
			rating_history: p.rating_history_visibility,
			home_club: p.home_club_visibility,
			city_region: p.city_region_visibility,
			rating: p.rating_visibility,
			name: p.name_format
		}
	};
}

function toUpdateIn(change: MySettingsChange): PlayerUpdateIn {
	const body: PlayerUpdateIn = {};
	if (change.privacy) {
		const privacy: Record<string, string> = {};
		for (const [key, value] of Object.entries(change.privacy)) {
			privacy[privacyField(key as PrivacyKey)] = value;
		}
		body.privacy = privacy as PrivacyIn;
	}
	return body;
}

/**
 * The player's name, its lock and the privacy settings, or `null` when `me/player` answers a 404 or
 * 405 (no player to read). Throws an `AppError` for anything else.
 */
export async function fetchMySettings({
	api = appApi
}: ApiOption = {}): Promise<MySettings | null> {
	try {
		return toMySettings(await unwrap(api.open.GET('/api/v1/me/player')));
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}

/**
 * Save a change with `PATCH me/player` and return the settings the backend now holds.
 * The backend decides what the player may change. Throws an `AppError` on failure.
 */
export async function updateMySettings(
	change: MySettingsChange,
	{ api = appApi }: ApiOption = {}
): Promise<MySettings> {
	const dto = await unwrap(api.open.PATCH('/api/v1/me/player', { body: toUpdateIn(change) }));
	return toMySettings(dto);
}

/**
 * A player's current ratings, from `GET players/{code}/ratings` (backend#53). `null` on a 404,
 * which the backend sends alike for an unknown code, a hidden player and an inactive account.
 * Throws an `AppError` for anything else.
 */
export async function fetchRatings(
	code: string,
	{ api = appApi }: ApiOption = {}
): Promise<PlayerRatings | null> {
	try {
		const dto = await unwrap(
			api.open.GET('/api/v1/players/{code}/ratings', { params: { path: { code } } })
		);
		return toPlayerRatings(dto);
	} catch (error) {
		if (isAppError(error) && error.status === 404) return null;
		throw error;
	}
}

/**
 * One page of a player's rating history, newest first, from `GET players/{code}/rating-history`
 * (`list_player_rating_history`, backend#53). `null` on a 404, which the backend sends alike for
 * an unknown code, an inactive account and history kept private by `rating_history_visibility`.
 * The player always sees their own. Throws an `AppError` for anything else.
 */
export async function fetchRatingHistory(
	code: string,
	offset = 0,
	{ api = appApi, limit = HISTORY_PAGE_SIZE }: ApiOption & { limit?: number } = {}
): Promise<RatingHistoryPage | null> {
	try {
		const dto = await unwrap(
			api.open.GET('/api/v1/players/{code}/rating-history', {
				params: { path: { code }, query: { limit, offset } }
			})
		);
		return toRatingHistoryPage(dto);
	} catch (error) {
		if (isAppError(error) && error.status === 404) return null;
		throw error;
	}
}
