import { mockStore, type MockStore } from '../store';
import { createAllauthHandlers } from './allauth';
import { createOpenHandlers } from './open';
import { createSearchHandlers } from './search';
import { createProvisionalHandlers, type ProvisionalOptions } from './provisional';
import { createPhotonHandlers } from './photon';

/** Every endpoint the app uses: allauth, the OPEN API and the provisional ones. */
export function createHandlers(store: MockStore = mockStore) {
	return [
		...createAllauthHandlers(store),
		...createOpenHandlers(store),
		...createSearchHandlers(store),
		...createProvisionalHandlers(store),
		...createPhotonHandlers()
	];
}

/**
 * Only the endpoints the backend lacks, plus the place search so a mock run never reaches the
 * real Photon, for `PUBLIC_API_MOCK=missing`.
 */
export function createMissingHandlers(
	store: MockStore = mockStore,
	options: ProvisionalOptions = { standalone: true }
) {
	return [...createProvisionalHandlers(store, options), ...createPhotonHandlers()];
}

export const handlers = createHandlers();
export const missingHandlers = createMissingHandlers();
