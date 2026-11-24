import {
	api as appApi,
	isAppError,
	provisionalApi,
	unwrap,
	type ApiOption,
	type OpenComponents
} from '#lib/api/index.js';
import { parsePlayerCode } from '#lib/domain/index.js';
import { toPlayerRatings } from './ratings.js';
import type { MyPlayer, MySettings, MySettingsChange, PlayerRatings, PrivacyKey } from './types.js';

type MyPlayerOut = OpenComponents['schemas']['MyPlayerOut'];
type PlayerUpdateIn = OpenComponents['schemas']['PlayerUpdateIn'];
type PrivacyIn = OpenComponents['schemas']['PrivacyIn'];

function isMissing(error: unknown): boolean {
	return isAppError(error) && (error.status === 404 || error.status === 405);
}

/**
 * The signed-in account's own player, or `null` when the backend has no such endpoint
 * (a 404 or 405) or the account has no player yet. Throws an `AppError` for anything else,
 * including a 401 when nobody is signed in.
 */
export async function fetchMyPlayer({ api = appApi }: ApiOption = {}): Promise<MyPlayer | null> {
	try {
		const dto = await unwrap(api.open.GET('/api/v1/me/player'));
		const code = parsePlayerCode(dto.code);
		if (!code.ok) return null;
		return { code: code.value, displayName: dto.display_name };
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}

function toMySettings(dto: MyPlayerOut): MySettings {
	const p = dto.privacy;
	return {
		displayName: dto.display_name,
		privacy: {
			match_history: p.match_history_visibility,
			stats: p.stats_visibility,
			rating_history: p.rating_history_visibility,
			home_club: p.home_club_visibility,
			city_region: p.city_region_visibility
		}
	};
}

function toUpdateIn(change: MySettingsChange): PlayerUpdateIn {
	const body: PlayerUpdateIn = {};
	if (change.displayName !== undefined) body.display_name = change.displayName;
	if (change.privacy) {
		const privacy: PrivacyIn = {};
		for (const [key, value] of Object.entries(change.privacy)) {
			privacy[`${key as PrivacyKey}_visibility`] = value;
		}
		body.privacy = privacy;
	}
	return body;
}

/**
 * The player's display name and privacy settings, or `null` when the backend has no
 * `me/player` endpoint (a 404 or 405, an older backend) or the account has no player. Throws
 * an `AppError` for anything else.
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
 * A player's ratings. Only mock modes call this (Decision Q2): the real backend has no
 * ratings yet, so this one still reads `provisionalApi` (frontend#35). `null` when the player
 * has none to show.
 */
export async function fetchRatings(code: string): Promise<PlayerRatings | null> {
	try {
		const dto = await unwrap(
			provisionalApi.GET('/api/v1/players/{code}/ratings', { params: { path: { code } } })
		);
		return toPlayerRatings(dto);
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}
