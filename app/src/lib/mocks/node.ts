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
// From the client module, not the api index, so a test can mock the index with this client.
import { createApi, type Api } from '../api/client';
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

/**
 * The real client against the mocks, with a cookie jar as a browser has, so the CSRF cookie and
 * session carry from one call to the next. A route test can put it in place of the app-wide `api`.
 */
export function cookieJarApi(baseUrl = 'http://localhost'): Api {
	const jar = new Map<string, string>();
	const fetchWithJar: typeof fetch = async (input, init) => {
		const response = await fetch(input, init);
		for (const line of response.headers.getSetCookie()) {
			const [pair] = line.split(';');
			const [name, ...value] = pair.split('=');
			jar.set(name.trim(), value.join('='));
		}
		return response;
	};
	const getCookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	return createApi({ baseUrl, fetch: fetchWithJar, getCookies });
}
