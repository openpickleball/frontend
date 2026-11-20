import { isAppError, provisionalApi, unwrap } from '#lib/api/index.js';
import { parsePlayerCode } from '#lib/domain/index.js';
import { toPlayerRatings } from './ratings.js';
import type { MyPlayer, PlayerRatings } from './types.js';

function isMissing(error: unknown): boolean {
	return isAppError(error) && (error.status === 404 || error.status === 405);
}

/**
 * The signed-in account's own player, or `null` when the backend has no such endpoint
 * (a 404 or 405) or the account has no player yet. Throws an `AppError` for anything else,
 * including a 401 when nobody is signed in.
 */
export async function fetchMyPlayer(): Promise<MyPlayer | null> {
	try {
		const dto = await unwrap(provisionalApi.GET('/api/v1/me/player'));
		const code = parsePlayerCode(dto.code);
		if (!code.ok) return null;
		return { code: code.value, displayName: dto.display_name };
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}

/**
 * A player's ratings. Only mock modes call this (Decision Q2): the real backend has no
 * ratings yet. `null` when the player has none to show.
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
