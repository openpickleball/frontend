import type { ClientInit } from '@sveltejs/kit/hooks';
import { PUBLIC_API_MOCK } from '$app/env/public';
import { asset } from '$app/paths';

/**
 * Runs once in the browser, before the app makes requests. `PUBLIC_API_MOCK` is
 * `off` (default), `missing` or `all` (see `src/lib/mocks/`). The mock module and its
 * service worker load only when it is not `off`.
 */
export const init: ClientInit = async () => {
	if (PUBLIC_API_MOCK === 'off') return;
	const { startMocks } = await import('./lib/mocks/browser');
	await startMocks(PUBLIC_API_MOCK, { workerUrl: asset('mockServiceWorker.js') });
};
