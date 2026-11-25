/**
 * Starts the service worker for the mock modes. Import this module only when the mode
 * is not `off` (see `hooks.client.ts`), so the worker never registers otherwise.
 *
 * `window.__openMock` helps with manual testing and e2e: `mail()` lists the messages the
 * backend would have emailed (with their keys), `reset()` returns to the seed data, and
 * `olderBackend()` makes every `me/player` call a 404, as a backend older than backend#124
 * answers, until the next `reset()`.
 */
import { setupWorker } from 'msw/browser';
import { createHandlers, createMissingHandlers } from './handlers';
import type { MockMode } from './mode';
import { mockStore } from './store';

/** Bump the suffix when the shape of the mock state changes. */
const STORAGE_KEY = 'open-mock-state-v1';

declare global {
	interface Window {
		__openMock?: {
			mail: () => typeof mockStore.state.outbox;
			reset: () => void;
			olderBackend: () => void;
		};
	}
}

function load(): void {
	try {
		const saved = sessionStorage.getItem(STORAGE_KEY);
		// A snapshot that does not match this version of the mocks is dropped.
		if (saved && !mockStore.restore(saved)) sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// No storage: start from the seed.
	}
}

function save(): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, mockStore.snapshot());
	} catch {
		// Not worth failing a request over.
	}
}

export async function startMocks(
	mode: Exclude<MockMode, 'off'>,
	options: { workerUrl?: string } = {}
): Promise<void> {
	load();
	const worker = setupWorker(
		...(mode === 'all' ? createHandlers(mockStore) : createMissingHandlers(mockStore))
	);
	worker.events.on('response:mocked', save);
	window.__openMock = {
		mail: () => mockStore.state.outbox,
		reset: () => {
			mockStore.reset();
			save();
		},
		olderBackend: () => {
			mockStore.olderBackend();
			save();
		}
	};
	await worker.start({
		serviceWorker: { url: options.workerUrl ?? '/mockServiceWorker.js' },
		// Pages and fonts pass through. In `all` mode a missed API call is a gap worth a warning;
		// in `missing` mode API calls go to the real backend on purpose.
		onUnhandledFrame({ frame, defaults }) {
			const { request } = frame.data as { request?: Request };
			if (mode !== 'all' || !request) return;
			if (/^\/(api|_allauth)\//.test(new URL(request.url).pathname)) defaults.warn();
		}
	});
	console.info(`[open mock] API mocks on (${mode}). window.__openMock.mail() lists sent mail.`);
}
