/**
 * `forgetEmail(email)`: delete one account's queue from the device by its email, even when the
 * queue no longer shows that account, such as after a deletion that a 401 beat to the device
 * (plan `delete-account`, criterion 5).
 */
import { describe, expect, it } from 'vitest';
import { createOfflineQueue } from './queue.svelte.js';
import { memoryStore } from './store.js';
import type { MatchBody } from './types.js';

// Made-up players and accounts.
const AVERY = 'avery.nightjar@example.test';
const ROWAN = 'rowan.pike@example.test';

const body: MatchBody = {
	format: 'singles',
	played_on: '2026-11-14',
	team_a: ['P-AAAA-BBBB'],
	team_b: ['P-CCCC-DDDD'],
	games: [{ team_a: 11, team_b: 6 }]
};
const form = { format: 'singles' };

let ids = 0;
function setup() {
	const store = memoryStore();
	const queue = createOfflineQueue({
		store,
		send: async () => ({ kind: 'retry', offline: true }),
		online: () => false,
		newId: () => `id-${++ids}`,
		now: () => new Date(Date.UTC(2026, 10, 14, 10, 0, 0)),
		exclusive: (work) => work()
	});
	return { queue, store };
}

describe('OfflineQueue: forgetEmail', () => {
	it('deletes that account queue from the device when no account is set', async () => {
		const { queue, store } = setup();
		await queue.setAccount(AVERY);
		await queue.add({ own: 'P-AAAA-BBBB', body, form });
		await queue.setAccount(null);
		expect(store.all()).toHaveLength(1);

		await queue.forgetEmail(AVERY);
		expect(store.all()).toEqual([]);
	});

	it("keeps another current account's queue and its view", async () => {
		const { queue, store } = setup();
		await queue.setAccount(AVERY);
		await queue.add({ own: 'P-AAAA-BBBB', body, form });
		await queue.setAccount(ROWAN);
		await queue.add({ own: 'P-EEEE-FFFF', body, form });

		await queue.forgetEmail(AVERY);
		expect(store.all().map((item) => item.own)).toEqual(['P-EEEE-FFFF']);
		expect(queue.items.map((item) => item.own)).toEqual(['P-EEEE-FFFF']);
	});

	it('clears the view too when it is the current account', async () => {
		const { queue, store } = setup();
		await queue.setAccount(AVERY);
		await queue.add({ own: 'P-AAAA-BBBB', body, form });

		await queue.forgetEmail(AVERY);
		expect(queue.items).toEqual([]);
		expect(store.all()).toEqual([]);
	});
});
