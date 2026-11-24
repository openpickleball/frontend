import { describe, expect, it } from 'vitest';
import { cacheName, isNetworkOnly, route, staleCaches } from './routing';

const origin = 'https://app.example';
const precached = new Set(['/index.html', '/_app/immutable/app.js', '/manifest.webmanifest']);
const decide = (path: string, init: { method?: string; mode?: string; origin?: string } = {}) =>
	route({
		method: init.method ?? 'GET',
		mode: init.mode ?? 'no-cors',
		url: new URL(path, init.origin ?? origin),
		origin,
		precached
	});

describe('isNetworkOnly', () => {
	it('covers the API and the auth paths', () => {
		expect(isNetworkOnly('/api/v1/matches')).toBe(true);
		expect(isNetworkOnly('/_allauth/browser/v1/auth/session')).toBe(true);
		expect(isNetworkOnly('/api')).toBe(true);
	});

	it('leaves app paths alone', () => {
		expect(isNetworkOnly('/matches')).toBe(false);
		expect(isNetworkOnly('/apiary')).toBe(false);
	});
});

describe('route', () => {
	it('answers precached files from the cache', () => {
		expect(decide('/_app/immutable/app.js')).toBe('precached');
		expect(decide('/manifest.webmanifest')).toBe('precached');
	});

	it('serves page loads with the shell fallback, whatever the path', () => {
		expect(decide('/', { mode: 'navigate' })).toBe('navigation');
		expect(decide('/matches/ABC', { mode: 'navigate' })).toBe('navigation');
	});

	it('never touches the API or the auth paths, even for a page load', () => {
		expect(decide('/api/v1/me')).toBe('ignore');
		expect(decide('/_allauth/browser/v1/auth/login')).toBe('ignore');
		expect(decide('/api/v1/me', { mode: 'navigate' })).toBe('ignore');
	});

	it('ignores writes, other origins and files it did not precache', () => {
		expect(decide('/matches', { method: 'POST', mode: 'navigate' })).toBe('ignore');
		expect(decide('/_app/immutable/app.js', { origin: 'https://cdn.example' })).toBe('ignore');
		expect(decide('/unknown.png')).toBe('ignore');
	});

	it('never caches the city search, which is another origin', () => {
		// The literal Photon address with a query, as a request from the app would send it.
		const search = 'https://photon.komoot.io/api/?q=Riverbend&limit=15';
		expect(decide(search, { mode: 'cors' })).toBe('ignore');
		expect(decide(search, { mode: 'navigate' })).toBe('ignore');
	});
});

describe('staleCaches', () => {
	it('keeps the current build and deletes older shell caches only', () => {
		const names = [cacheName('1'), cacheName('2'), 'other-cache'];
		expect(staleCaches(names, '2')).toEqual([cacheName('1')]);
	});
});
