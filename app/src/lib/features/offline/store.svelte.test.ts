// Runs in the browser project (the `.svelte.test.ts` name), for a real IndexedDB.
import { afterEach, describe, expect, it } from 'vitest';
import { DB_NAME, indexedDbStore, parseQueued } from './store.js';
import type { QueuedMatch } from './types.js';

// Made-up players. The account keys stand in for hashed emails.
const item = (id: string, account: string, queuedAt: string): QueuedMatch => ({
	id,
	account,
	own: 'P-AAAA-BBBB',
	body: {
		format: 'singles',
		played_on: '2026-11-14',
		team_a: ['P-AAAA-BBBB'],
		team_b: ['P-CCCC-DDDD'],
		games: [{ team_a: 11, team_b: 6 }]
	},
	form: { format: 'singles' },
	queuedAt,
	problem: null
});

afterEach(
	() =>
		new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase(DB_NAME);
			req.onsuccess = req.onerror = req.onblocked = () => resolve();
		})
);

describe('indexedDbStore', () => {
	it('keeps matches per account, oldest first, across connections', async () => {
		const store = indexedDbStore();
		await store.put(item('b', 'v1:one', '2026-11-14T10:00:02Z'));
		await store.put(item('a', 'v1:one', '2026-11-14T10:00:01Z'));
		await store.put(item('c', 'v1:two', '2026-11-14T10:00:00Z'));

		const again = indexedDbStore();
		expect((await again.list('v1:one')).map((i) => i.id)).toEqual(['a', 'b']);
		expect((await again.list('v1:two')).map((i) => i.id)).toEqual(['c']);
	});

	it('replaces by id, removes one, and removes one account', async () => {
		const store = indexedDbStore();
		await store.put(item('a', 'v1:one', '2026-11-14T10:00:01Z'));
		await store.put(item('b', 'v1:one', '2026-11-14T10:00:02Z'));
		await store.put(item('c', 'v1:two', '2026-11-14T10:00:03Z'));
		const problem = { kind: 'invalid' as const, message: 'No.', fields: { played_on: ['Bad.'] } };
		await store.put({ ...item('a', 'v1:one', '2026-11-14T10:00:01Z'), problem });
		expect((await store.list('v1:one'))[0].problem).toEqual(problem);

		await store.remove('b');
		expect((await store.list('v1:one')).map((i) => i.id)).toEqual(['a']);

		await store.removeAccount('v1:one');
		expect(await store.list('v1:one')).toEqual([]);
		expect((await store.list('v1:two')).map((i) => i.id)).toEqual(['c']);
	});

	it('rejects when IndexedDB is not there', async () => {
		const store = indexedDbStore(() => undefined);
		await expect(store.put(item('a', 'v1:one', '2026-11-14T10:00:01Z'))).rejects.toThrow();
		await expect(store.list('v1:one')).rejects.toThrow();
	});
});

describe('parseQueued', () => {
	it('drops records that are not queued matches', () => {
		expect(parseQueued(null)).toBeNull();
		expect(parseQueued({ id: 'a' })).toBeNull();
		expect(parseQueued({ ...item('a', 'v1:one', 'x'), problem: { kind: 'other' } })).toBeNull();
		expect(parseQueued(item('a', 'v1:one', 'x'))).toEqual(item('a', 'v1:one', 'x'));
	});
});
