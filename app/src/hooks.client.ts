import type { ClientInit } from '@sveltejs/kit/hooks';
import { PUBLIC_API_MOCK } from '$app/env/public';
import { asset } from '$app/paths';
import { dev } from '$app/env';
import { toast } from 'svelte-sonner';
import { registerServiceWorker, shouldRegister } from './pwa/register';

/**
 * Runs once in the browser, before the app makes requests. `PUBLIC_API_MOCK` is
 * `off` (default), `missing` or `all` (see `src/lib/mocks/`). The mock module and its
 * service worker load only when it is not `off`.
 *
 * A failed worker start must not stop the app from starting: it is logged instead.
 */
export const init: ClientInit = async () => {
	if (PUBLIC_API_MOCK === 'off') {
		// The app shell worker. Never in the mock modes (MSW owns the worker there) or in dev.
		// Not awaited: the app must not wait for it.
		if (shouldRegister({ mock: PUBLIC_API_MOCK, dev, supported: 'serviceWorker' in navigator })) {
			registerServiceWorker(offerUpdate).catch((error) => {
				console.error('The app shell worker did not start. The app still works online.', error);
			});
		}
		return;
	}
	try {
		const { startMocks } = await import('./lib/mocks/browser');
		await startMocks(PUBLIC_API_MOCK, { workerUrl: asset('mockServiceWorker.js') });
	} catch (error) {
		console.error(
			`PUBLIC_API_MOCK=${PUBLIC_API_MOCK} is set, but the API mocks did not start. ` +
				'API calls will go to the network. Set PUBLIC_API_MOCK=off, or check that ' +
				'the browser allows service workers.',
			error
		);
	}
};

/** The "Update available" toast. It stays until the player acts on it. */
function offerUpdate(apply: () => void) {
	toast('Update available', {
		description: 'Reload to get the latest version.',
		id: 'update-available',
		duration: Infinity,
		action: { label: 'Reload', onClick: apply }
	});
}
