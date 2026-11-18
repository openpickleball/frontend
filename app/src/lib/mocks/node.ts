/**
 * msw/node for Vitest, with the same handlers the browser uses.
 *
 * Call `useMockApi()` at the top of a test file. It starts the server before the tests,
 * resets the handlers and the mock store after each, and stops the server at the end.
 * Requests with no handler fail the test, so a test cannot reach a real network. It
 * needs no change to `vite.config.ts`.
 */
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
import { resetMockStore } from './store';

export const server = setupServer(...handlers);

export function useMockApi(): typeof server {
	beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
	afterEach(() => {
		server.resetHandlers();
		resetMockStore();
	});
	afterAll(() => server.close());
	return server;
}
