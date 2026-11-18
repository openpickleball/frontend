import { describe, expect, it } from 'vitest';
import type { PlayerCode } from '#lib/domain/index.js';
import { MatchCache, ownerKey } from './cache.svelte.js';
import { BEA, TAMSIN, sampleMatch } from './testing.js';

function cacheFor(initial: PlayerCode | null) {
	let owner = initial;
	const cache = new MatchCache(() => owner);
	return {
		cache,
		signInAs: (next: PlayerCode | null) => {
			owner = next;
		}
	};
}

describe('MatchCache', () => {
	it('keeps a match by code and hands back the newest copy', () => {
		const { cache } = cacheFor(TAMSIN);
		const match = sampleMatch();
		expect(cache.get(match.code)).toBeUndefined();
		cache.remember(match);
		expect(cache.get(match.code)).toBe(match);
		const confirmed = sampleMatch({ status: 'confirmed' });
		cache.remember(confirmed);
		expect(cache.get(match.code)).toBe(confirmed);
	});

	it('fills from a list', () => {
		const { cache } = cacheFor(TAMSIN);
		const a = sampleMatch();
		const b = sampleMatch({ code: sampleMatch().code.replace('7QK2', '3FTB') as never });
		cache.rememberAll([a, b]);
		expect(cache.get(a.code)).toBe(a);
		expect(cache.get(b.code)).toBe(b);
	});

	it('knows nothing about what the player did until they act', () => {
		const { cache } = cacheFor(TAMSIN);
		const match = sampleMatch();
		cache.remember(match);
		expect(cache.actedOn(match.code)).toBeUndefined();
		cache.markActed(match.code, 'confirm');
		expect(cache.actedOn(match.code)).toBe('confirm');
		cache.markActed(match.code, 'dispute');
		expect(cache.actedOn(match.code)).toBe('dispute');
	});

	it('stores nothing while no player is signed in', () => {
		const { cache } = cacheFor(null);
		const match = sampleMatch();
		cache.remember(match);
		cache.markActed(match.code, 'confirm');
		expect(cache.get(match.code)).toBeUndefined();
		expect(cache.actedOn(match.code)).toBeUndefined();
	});

	it('never shows one player’s matches to the next', () => {
		const { cache, signInAs } = cacheFor(TAMSIN);
		const match = sampleMatch();
		cache.remember(match);
		cache.markActed(match.code, 'confirm');

		// Reads stop at once, before anything writes.
		signInAs(BEA);
		expect(cache.get(match.code)).toBeUndefined();
		expect(cache.actedOn(match.code)).toBeUndefined();

		// The first write for the new player drops the old data for good.
		cache.remember(sampleMatch({ status: 'confirmed' }));
		signInAs(TAMSIN);
		expect(cache.get(match.code)).toBeUndefined();
	});

	it('also empties when the player signs out and back in as the same account', () => {
		const { cache, signInAs } = cacheFor(TAMSIN);
		const match = sampleMatch();
		cache.remember(match);
		signInAs(null);
		expect(cache.get(match.code)).toBeUndefined();
		cache.reset();
		signInAs(TAMSIN);
		expect(cache.get(match.code)).toBeUndefined();
	});
});

describe('ownerKey', () => {
	it('is the account and the code together, so one code under two accounts is two owners', () => {
		expect(ownerKey('a@example.com', TAMSIN)).not.toBe(ownerKey('b@example.com', TAMSIN));
		expect(ownerKey('A@Example.com', TAMSIN)).toBe(ownerKey('a@example.com', TAMSIN));
	});

	it('is null when the email or the code is missing', () => {
		expect(ownerKey(null, TAMSIN)).toBeNull();
		expect(ownerKey('a@example.com', null)).toBeNull();
	});

	it('empties the cache when only the account changes and the code stays', () => {
		let email: string | null = 'a@example.com';
		const cache = new MatchCache(() => ownerKey(email, TAMSIN));
		const match = sampleMatch();
		cache.remember(match);
		expect(cache.get(match.code)).toBe(match);
		email = 'b@example.com';
		expect(cache.get(match.code)).toBeUndefined();
		cache.remember(sampleMatch({ status: 'confirmed' }));
		email = 'a@example.com';
		expect(cache.get(match.code)).toBeUndefined();
	});
});
