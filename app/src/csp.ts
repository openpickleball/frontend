/**
 * The app's Content Security Policy, passed to `kit.csp` in `vite.config.ts`. Pure, so it is
 * tested in node (`csp.test.ts`).
 *
 * SvelteKit writes it into the static shell as a `<meta http-equiv>` tag and adds a hash for its
 * own inline script to `script-src`. App Platform cannot send response headers for a static site,
 * so the meta tag is the only policy the app gets. A meta policy ignores `frame-ancestors`,
 * `report-uri` and `sandbox`, so they are left out. See "Hosting on App Platform" in README.md.
 *
 * Every origin the browser talks to goes here. `src/app.html` keeps no inline script.
 */
import type { Config } from '@sveltejs/kit/vite';
import { PHOTON_URL } from './lib/features/places/photon.ts';

export type CspDirectives = NonNullable<NonNullable<Config['csp']>['directives']>;

/** An `https` origin with a dotted host, the shape `kit.csp` accepts as a host source. */
type HttpsOrigin = `https://${string}.${string}`;

function isHttpsOrigin(value: string): value is HttpsOrigin {
	return /^https:\/\/[^/]+\.[^/]+$/.test(value);
}

/** The origin of an `https` URL, for a fetch directive. Throws on anything else. */
export function originOf(url: string): HttpsOrigin {
	const { origin } = new URL(url);
	if (!isHttpsOrigin(origin)) throw new Error(`Not an https origin: ${url}`);
	return origin;
}

export const directives = {
	'default-src': ['self'],
	'script-src': ['self'],
	// The city search (src/lib/features/places/photon.ts).
	'connect-src': ['self', originOf(PHOTON_URL)],
	// The app's service worker, and MSW's in the mock modes.
	'worker-src': ['self'],
	'object-src': ['none'],
	'base-uri': ['none'],
	'form-action': ['self'],
	// SvelteKit's route announcer (`#svelte-announcer` in its root.svelte) has a static style
	// attribute, which Svelte builds from an HTML template, so the browser checks it against the
	// policy. Only its hash is allowed, not every inline style. csp.test.ts checks the hash against
	// the installed SvelteKit, so an upgrade that changes the attribute fails the tests.
	'style-src-attr': ['unsafe-hashes', 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=']
} satisfies CspDirectives;
