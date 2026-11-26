import { mockStore, type MockStore } from '../store';
import { createAllauthHandlers } from './allauth';
import { createOpenHandlers } from './open';
import { createSearchHandlers } from './search';
import { createPhotonHandlers } from './photon';

/**
 * Every endpoint the app uses: allauth and the OPEN API (with `me/player`, player profiles and
 * ratings). Search comes before the OPEN handlers, because `/api/v1/players/{code}` would also
 * match `/api/v1/players/search`.
 */
export function createHandlers(store: MockStore = mockStore) {
	return [
		...createAllauthHandlers(store),
		...createSearchHandlers(store),
		...createOpenHandlers(store),
		...createPhotonHandlers()
	];
}

/**
 * For `PUBLIC_API_MOCK=missing`: only the place search, so a mock run never reaches the real
 * Photon. The backend now has every OPEN endpoint the app calls, ratings included, so they all
 * go to it.
 */
export function createMissingHandlers() {
	return [...createPhotonHandlers()];
}

export const handlers = createHandlers();
export const missingHandlers = createMissingHandlers();
