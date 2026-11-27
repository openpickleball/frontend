import { describe, expect, it } from 'vitest';
import { isAccountPath, isGuardedPath, loginUrl, redirectFor, safeNext } from './guard';

describe('isGuardedPath', () => {
	it('guards the signed-in routes and the pages under them', () => {
		for (const path of [
			'/',
			'/record',
			'/matches',
			'/matches/M-7QK2-H9WD-3NFA',
			'/ratings',
			'/profile',
			'/profile/ratings',
			'/organizer'
		]) {
			expect(isGuardedPath(path), path).toBe(true);
		}
	});

	it('leaves the account pages and unknown paths open', () => {
		for (const path of [
			'/account/login',
			'/account/signup',
			'/recording',
			'/profiles',
			'/ratingsx',
			'/organizers',
			'/x'
		]) {
			expect(isGuardedPath(path), path).toBe(false);
		}
	});
});

describe('isAccountPath', () => {
	it('matches /account and the pages under it only', () => {
		expect(isAccountPath('/account/login')).toBe(true);
		expect(isAccountPath('/account/password/reset/key/abc')).toBe(true);
		expect(isAccountPath('/accounts')).toBe(false);
		expect(isAccountPath('/')).toBe(false);
	});
});

describe('safeNext (no open redirect)', () => {
	it('keeps a same-site path, with its query and hash', () => {
		expect(safeNext('/record')).toBe('/record');
		expect(safeNext('/matches/M-7QK2-H9WD-3NFA')).toBe('/matches/M-7QK2-H9WD-3NFA');
		expect(safeNext('/matches?offset=20&limit=20#top')).toBe('/matches?offset=20&limit=20#top');
	});

	it('refuses anything that could leave the site', () => {
		const attacks = [
			'https://evil.example/',
			'http://evil.example',
			'//evil.example',
			'///evil.example',
			'/\\evil.example',
			'\\\\evil.example',
			'\\/evil.example',
			'/\t/evil.example',
			'/\n/evil.example',
			'/..//evil.com',
			'/%2e%2e//evil.com',
			'/a/../..//evil.com',
			'/.//evil.com',
			'/./%2e//evil.com',
			'/\u0000//evil.example',
			'javascript:alert(1)',
			'data:text/html,hi',
			'evil.example',
			'record',
			' /record',
			'mailto:a@example.com'
		];
		for (const attack of attacks) expect(safeNext(attack), JSON.stringify(attack)).toBeNull();
	});

	it('refuses empty, missing and very long values', () => {
		expect(safeNext('')).toBeNull();
		expect(safeNext(null)).toBeNull();
		expect(safeNext(undefined)).toBeNull();
		expect(safeNext('/' + 'a'.repeat(3000))).toBeNull();
	});

	it('refuses account pages, which would only bounce back', () => {
		expect(safeNext('/account/login')).toBeNull();
		expect(safeNext('/account/signup?next=/record')).toBeNull();
	});
});

describe('loginUrl', () => {
	it('carries the page the player wanted', () => {
		expect(loginUrl('/record')).toBe('/account/login?next=%2Frecord');
		expect(loginUrl('/matches?offset=20')).toBe('/account/login?next=%2Fmatches%3Foffset%3D20');
	});

	it('leaves next off for home and for anything unsafe', () => {
		expect(loginUrl('/')).toBe('/account/login');
		expect(loginUrl('//evil.example')).toBe('/account/login');
		expect(loginUrl('/..//evil.com')).toBe('/account/login');
	});
});

describe('redirectFor', () => {
	const at = (pathname: string, search = '') => ({ pathname, search });

	it('sends a signed-out player from a signed-in page to sign in, with next', () => {
		expect(redirectFor(at('/record'), false)).toBe('/account/login?next=%2Frecord');
		expect(redirectFor(at('/matches/M-7QK2-H9WD-3NFA'), false)).toBe(
			'/account/login?next=%2Fmatches%2FM-7QK2-H9WD-3NFA'
		);
		expect(redirectFor(at('/'), false)).toBe('/account/login');
	});

	it('lets a signed-out player see the account pages', () => {
		expect(redirectFor(at('/account/login'), false)).toBeNull();
		expect(redirectFor(at('/account/verify-email/abc'), false)).toBeNull();
	});

	it('sends a signed-in player from sign in, sign up and reset request home', () => {
		expect(redirectFor(at('/account/login'), true)).toBe('/');
		expect(redirectFor(at('/account/signup'), true)).toBe('/');
		expect(redirectFor(at('/account/password/reset'), true)).toBe('/');
		expect(redirectFor(at('/account/login/'), true)).toBe('/');
	});

	it('lets a signed-in player open a verify or reset link (change email is on)', () => {
		expect(redirectFor(at('/account/verify-email/abc'), true)).toBeNull();
		expect(redirectFor(at('/account/password/reset/key/abc'), true)).toBeNull();
	});

	it('lets a signed-in player see the signed-in pages', () => {
		expect(redirectFor(at('/record'), true)).toBeNull();
		expect(redirectFor(at('/'), true)).toBeNull();
	});
});
