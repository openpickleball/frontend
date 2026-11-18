import type { Client } from 'openapi-fetch';
import { api, isAppError, unwrap } from '#lib/api/index.js';
import type { paths as ProvisionalPaths } from '#lib/api/provisional.js';
import { parsePlayerCode } from '#lib/domain/index.js';
import { toPlayerRatings } from './ratings.js';
import type { MyPlayer, PlayerRatings } from './types.js';

/**
 * `me/player` and `players/{code}/ratings` are not in the generated schema yet, so the
 * generated client has no type for them. The hand-written paths in `api/provisional.ts`
 * describe them. Same client, same CSRF and error handling, only the types differ.
 * Delete this cast when the backend ships them and `provisional.ts` goes (frontend#35).
 */
const provisional = api.open as unknown as Client<ProvisionalPaths>;

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
		const dto = await unwrap(provisional.GET('/api/v1/me/player'));
		const code = parsePlayerCode(dto.code);
		if (!code.ok) return null;
		return { code: code.value, displayName: dto.display_name };
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}

/** How many matches the player is in (the list's `count`), whatever their status. */
export async function fetchMatchCount(code: string): Promise<number> {
	const page = await unwrap(
		api.open.GET('/api/v1/players/{code}/matches', {
			params: { path: { code }, query: { limit: 1 } }
		})
	);
	return page.count;
}

/**
 * A player's ratings. Only mock modes call this (Decision Q2): the real backend has no
 * ratings yet. `null` when the player has none to show.
 */
export async function fetchRatings(code: string): Promise<PlayerRatings | null> {
	try {
		const dto = await unwrap(
			provisional.GET('/api/v1/players/{code}/ratings', { params: { path: { code } } })
		);
		return toPlayerRatings(dto);
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}
