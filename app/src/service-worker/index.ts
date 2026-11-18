// The app shell worker (plans/frontend-v1/proposal.md section 8). It precaches the build and the
// static files, falls back to the cached index.html when a page load fails, and never touches
// /api/ or /_allauth/. The routing decision is in pwa/routing.ts.
import { self as sw } from '$app/service-worker';
import { version } from '$app/env';
import { assets as staticFiles, immutable } from '$app/manifest';
import { cacheName, route, staleCaches } from '../pwa/routing';

// The SPA fallback page. adapter-static writes it, but it is not in the build or static files.
const SHELL = '/index.html';

// mockServiceWorker.js belongs to the mock modes, which never register this worker.
const assets = [
	...immutable.map((file) => file.path),
	...staticFiles.map((file) => file.path).filter((path) => path !== '/mockServiceWorker.js'),
	SHELL
];
const precached = new Set<string>(assets);
const CACHE = cacheName(version);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			// `reload` skips the HTTP cache, so a new build never precaches an old file.
			.then((cache) => cache.addAll(assets.map((path) => new Request(path, { cache: 'reload' }))))
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(staleCaches(names, version).map((name) => caches.delete(name)));
			// Control the page that registered this worker, so it works offline right away.
			await sw.clients.claim();
		})()
	);
});

// A new worker waits until the player taps "Reload" in the update toast.
sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const kind = route({
		method: request.method,
		mode: request.mode,
		url: new URL(request.url),
		origin: sw.location.origin,
		precached
	});
	if (kind === 'ignore') return;

	if (kind === 'precached') {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}

	// Navigation: network first, so a new build reaches online players. Every route is the same
	// single page, so the cached index.html serves any path when offline.
	event.respondWith(
		fetch(request).catch(async () => {
			const shell = await caches.match(SHELL);
			return shell ?? Response.error();
		})
	);
});
