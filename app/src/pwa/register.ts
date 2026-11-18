/**
 * Registers the app shell worker (`src/service-worker/index.ts`) and reports when an update is waiting.
 * SvelteKit's own auto-registration is off (`serviceWorker.register: false` in vite.config.ts),
 * because MSW owns the service worker in the mock modes and a page can't run two at one scope.
 */

export type RegisterContext = {
	/** `PUBLIC_API_MOCK`. */
	mock: string;
	/** Vite dev server. */
	dev: boolean;
	/** `'serviceWorker' in navigator`. */
	supported: boolean;
};

export function shouldRegister({ mock, dev, supported }: RegisterContext): boolean {
	return mock === 'off' && !dev && supported;
}

/** Calls `onUpdate` with a function that applies the update, when a new worker is waiting. */
export async function registerServiceWorker(onUpdate: (apply: () => void) => void): Promise<void> {
	const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });

	const offer = (worker: ServiceWorker) =>
		onUpdate(() => {
			let reloaded = false;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (reloaded) return;
				reloaded = true;
				location.reload();
			});
			worker.postMessage({ type: 'SKIP_WAITING' });
		});

	// A worker is only an update when an older one already controls the page. The first install
	// is not.
	if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting);
	registration.addEventListener('updatefound', () => {
		const worker = registration.installing;
		worker?.addEventListener('statechange', () => {
			if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
		});
	});

	// Installed apps stay open for days: look for a new build when the player comes back.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void registration.update().catch(() => {});
	});
}
