import { mockStore, type MockStore } from '../store';
import { createAllauthHandlers } from './allauth';
import { createOpenHandlers } from './open';
import { createProvisionalHandlers, type ProvisionalOptions } from './provisional';

/** Every endpoint the app uses: allauth, the OPEN API and the provisional ones. */
export function createHandlers(store: MockStore = mockStore) {
	return [
		...createAllauthHandlers(store),
		...createOpenHandlers(store),
		...createProvisionalHandlers(store)
	];
}

/** Only the endpoints the backend lacks, for `PUBLIC_API_MOCK=missing`. */
export function createMissingHandlers(
	store: MockStore = mockStore,
	options: ProvisionalOptions = { standalone: true }
) {
	return createProvisionalHandlers(store, options);
}

export const handlers = createHandlers();
export const missingHandlers = createMissingHandlers();
