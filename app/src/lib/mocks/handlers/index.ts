import { mockStore, type MockStore } from '../store';
import { createAllauthHandlers } from './allauth';
import { createOpenHandlers } from './open';
import { createSearchHandlers } from './search';
import { createProvisionalHandlers, type ProvisionalOptions } from './provisional';
import { createPhotonHandlers } from './photon';

/**
 * Every endpoint the app uses: allauth, the OPEN API (with `me/player` and player profiles) and
 * the provisional ratings. Search comes before the OPEN handlers, because
 * `/api/v1/players/{code}` would also match `/api/v1/players/search`.
 */
export function createHandlers(store: MockStore = mockStore) {
	return [
		...createAllauthHandlers(store),
		...createSearchHandlers(store),
		...createOpenHandlers(store),
		...createProvisionalHandlers(store),
		...createPhotonHandlers()
	];
}

/**
 * For `PUBLIC_API_MOCK=missing`: only the endpoint the backend lacks (ratings), plus the place
 * search so a mock run never reaches the real Photon. Everything else, `me/player` and player
 * profiles included, goes to the real backend.
 */
export function createMissingHandlers(
	store: MockStore = mockStore,
	options: ProvisionalOptions = { standalone: true }
) {
	return [...createProvisionalHandlers(store, options), ...createPhotonHandlers()];
}

export const handlers = createHandlers();
export const missingHandlers = createMissingHandlers();
