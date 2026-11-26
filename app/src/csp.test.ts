import { describe, expect, it } from 'vitest';
import { directives, originOf } from './csp';

const PLATFORM_FALLBACK = ['self'];

describe('directives', () => {
	it('allows only this origin by default', () => {
		expect(directives['default-src']).toEqual(['self']);
	});

	it('allows same-origin scripts only, and SvelteKit adds the inline hashes', () => {
		expect(directives['script-src']).toEqual(['self']);
	});

	it('lets the browser talk to this origin and the Photon origin, and nothing else', () => {
		// The origin of PHOTON_URL. csp.ts derives it from that constant; the test (which may not
		// import a feature) spells it out to catch a change to either.
		expect(directives['connect-src']).toEqual(['self', 'https://photon.komoot.io']);
	});

	it('locks down workers, plugins, the base URL and form targets', () => {
		expect(directives['worker-src']).toEqual(['self']);
		expect(directives['object-src']).toEqual(['none']);
		expect(directives['base-uri']).toEqual(['none']);
		expect(directives['form-action']).toEqual(['self']);
	});

	it('never allows inline or eval script', () => {
		for (const [name, sources] of Object.entries(directives)) {
			if (!name.startsWith('script-src') && name !== 'default-src') continue;
			expect(sources, name).not.toContain('unsafe-inline');
			expect(sources, name).not.toContain('unsafe-eval');
		}
	});

	it('leaves every other fetch directive to default-src or this origin', () => {
		const checked = new Set([
			'default-src',
			'script-src',
			'connect-src',
			'worker-src',
			'object-src',
			'base-uri',
			'form-action'
		]);
		for (const [name, sources] of Object.entries(directives)) {
			if (checked.has(name)) continue;
			expect(sources, name).toEqual(PLATFORM_FALLBACK);
		}
	});
});

describe('originOf', () => {
	it('keeps the scheme and host and drops the path', () => {
		expect(originOf('https://photon.komoot.io/api/?q=x')).toBe('https://photon.komoot.io');
	});

	it('refuses an origin that is not https', () => {
		expect(() => originOf('http://photon.komoot.io/api/')).toThrow('Not an https origin');
	});
});
