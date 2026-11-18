/**
 * Which requests the service worker may answer. Pure, so it is tested in node
 * (`routing.test.ts`). The worker itself is `src/service-worker.ts`.
 */

/** Paths that always go to the network and are never cached: they carry the session. */
const NETWORK_ONLY_PREFIXES = ['/api/', '/_allauth/'];

export type Route =
	/** Not ours: leave it to the browser. */
	| 'ignore'
	/** A page load: network first, the cached app shell when offline. */
	| 'navigation'
	/** A build or static file we precached: answer from the cache. */
	| 'precached';

export type RouteInput = {
	method: string;
	/** `Request.mode`. */
	mode: string;
	url: URL;
	/** The worker's own origin. */
	origin: string;
	/** Pathnames of everything precached. */
	precached: ReadonlySet<string>;
};

export function isNetworkOnly(pathname: string): boolean {
	return NETWORK_ONLY_PREFIXES.some(
		(prefix) => pathname.startsWith(prefix) || pathname === prefix.slice(0, -1)
	);
}

export function route({ method, mode, url, origin, precached }: RouteInput): Route {
	if (method !== 'GET') return 'ignore';
	if (url.origin !== origin) return 'ignore';
	if (isNetworkOnly(url.pathname)) return 'ignore';
	if (mode === 'navigate') return 'navigation';
	return precached.has(url.pathname) ? 'precached' : 'ignore';
}

/** The cache for one build. A new build has a new `version`, so it gets a new cache. */
export const CACHE_PREFIX = 'shell-';
export const cacheName = (version: string) => `${CACHE_PREFIX}${version}`;

/** Caches from older builds, which the worker deletes when it activates. */
export function staleCaches(names: readonly string[], version: string): string[] {
	const current = cacheName(version);
	return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
}
