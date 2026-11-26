// The app shell worker (plans/frontend-v1/proposal.md section 8). It precaches the build and the
// static files, falls back to the cached index.html when a page load fails, and never touches
// /api/, /_allauth/ or /oauth/. The routing decision is in pwa/routing.ts.
import { self as sw } from '$app/service-worker';
import { version } from '$app/env';
import { assets as staticFiles, immutable } from '$app/manifest';
import { cacheName, route, staleCaches } from '../pwa/routing';

// The SPA fallback page. adapter-static writes it, but it is not in the build or static files.
const SHELL = '/index.html';

// The manifest paths have no leading slash.
const abs = (path: string) => (path.startsWith('/') ? path : `/${path}`);
const assets = [...immutable, ...staticFiles].map((file) => abs(file.path));
const precached = new Set<string>(assets);
precached.add(SHELL);
const CACHE = cacheName(version);

// Servers send `Vary: Origin`, and module scripts are requested with an Origin header that the
// precache request did not have. Without this, those scripts would miss the cache offline.
const MATCH = { ignoreVary: true } as const;

// The shell is fetched as a page (Accept: text/html), because some servers only apply the SPA
// fallback to page requests. A server that has no /index.html file serves the shell at /.
async function fetchShell(): Promise<Response> {
	const init = { cache: 'reload', headers: { accept: 'text/html' } } as const;
	for (const path of [SHELL, '/']) {
		const response = await fetch(path, init);
		if (response.ok) return response;
	}
	throw new Error('The app shell could not be fetched.');
}

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			// `reload` skips the HTTP cache, so a new build never precaches an old file.
			await cache.addAll(assets.map((path) => new Request(path, { cache: 'reload' })));
			await cache.put(SHELL, await fetchShell());
		})()
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
		event.respondWith(caches.match(request, MATCH).then((hit) => hit ?? fetch(request)));
		return;
	}

	// Navigation: network first, so a new build reaches online players. Every route is the same
	// single page, so the cached index.html serves any path when offline.
	event.respondWith(
		fetch(request).catch(async () => {
			const shell = await caches.match(SHELL, MATCH);
			return shell ?? Response.error();
		})
	);
});
