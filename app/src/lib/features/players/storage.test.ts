import { describe, expect, it } from 'vitest';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { createCodeStore, storageKey } from './storage.js';

const CODE = buildCode('player', '4RWN8TQ') as PlayerCode;

describe('storage key', () => {
	it('is namespaced, versioned and scoped to the lowercased email', () => {
		expect(storageKey('Player@Example.com')).toBe('open:v1:my-player-code:player@example.com');
	});
});

describe('code store', () => {
	it('never throws when storage is missing or blocked', () => {
		const none = createCodeStore(() => null);
		expect(none.read('a@example.com')).toBeNull();
		expect(none.write('a@example.com', CODE)).toBe(false);
		none.remove('a@example.com');

		const blocked = createCodeStore(() => {
			throw new Error('blocked');
		});
		expect(blocked.read('a@example.com')).toBeNull();
		expect(blocked.write('a@example.com', CODE)).toBe(false);
	});

	it('removes a saved code', () => {
		const data = new Map<string, string>();
		const store = createCodeStore(() => ({
			getItem: (k) => data.get(k) ?? null,
			setItem: (k, v) => void data.set(k, v),
			removeItem: (k) => void data.delete(k)
		}));
		expect(store.write('a@example.com', CODE)).toBe(true);
		expect(store.read('a@example.com')).toBe(CODE);
		store.remove('a@example.com');
		expect(store.read('a@example.com')).toBeNull();
	});
});
