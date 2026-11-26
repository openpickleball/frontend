import { describe, expect, it, vi } from 'vitest';
import { parseMatchCode, type Match, type MatchCode } from '#lib/domain/index.js';
import { accountKey } from './account.js';
import { createOfflineQueue, type QueueDeps, type SentMatch } from './queue.svelte.js';
import type { SendOutcome } from './send.js';
import { memoryStore, type QueueStore } from './store.js';
import type { MatchBody, QueuedMatch } from './types.js';

// Made-up players and accounts.
const AVERY = 'avery.nightjar@example.test';
const ROWAN = 'rowan.pike@example.test';
const OWN = 'P-AAAA-BBBB';

function matchCode(text: string): MatchCode {
	const parsed = parseMatchCode(text);
	if (!parsed.ok) throw new Error('bad code');
	return parsed.value;
}
const CODE = matchCode('M-9QF6-RD2K-X3BP');

const body = (day = '2026-11-14'): MatchBody => ({
	format: 'singles',
	played_on: day,
	team_a: [OWN],
	team_b: ['P-CCCC-DDDD'],
	games: [{ team_a: 11, team_b: 6 }]
});

let ids = 0;
function setup(deps: Partial<QueueDeps> & { store?: QueueStore } = {}) {
	const store = (deps.store ?? memoryStore()) as ReturnType<typeof memoryStore>;
	let online = true;
	const send = vi.fn<(body: MatchBody) => Promise<SendOutcome>>(async () => ({
		kind: 'sent',
		match: { code: CODE } as Match
	}));
	let clock = 0;
	const queue = createOfflineQueue({
		store,
		send,
		online: () => online,
		newId: () => `id-${++ids}`,
		now: () => new Date(Date.UTC(2026, 10, 14, 10, 0, clock++)),
		exclusive: (work) => work(),
		...deps
	});
	const sent: SentMatch[][] = [];
	queue.onSent((items) => sent.push(items));
	return {
		queue,
		store,
		send,
		sent,
		setOnline: (value: boolean) => (online = value)
	};
}

const form = { format: 'singles' };

describe('accountKey', () => {
	it('is the same for the same email in any case, and never contains the email', async () => {
		const key = await accountKey(AVERY);
		expect(key).toBe(await accountKey(`  ${AVERY.toUpperCase()} `));
		expect(key).not.toContain('avery');
		expect(key).toMatch(/^v1:[0-9a-f]{64}$/);
		expect(await accountKey(ROWAN)).not.toBe(key);
	});
});

describe('OfflineQueue: one queue per account', () => {
	it('keeps nothing when nobody is signed in', async () => {
		const { queue } = setup();
		await expect(queue.add({ own: OWN, body: body(), form })).rejects.toThrow();
	});

	it('stores under the account key, and another account never sees or sends it', async () => {
		const { queue, store, send, setOnline } = setup();
		setOnline(false);
		await queue.setAccount(AVERY);
		await queue.add({ own: OWN, body: body(), form });
		expect(store.all()).toHaveLength(1);
		expect(store.all()[0].account).toBe(await accountKey(AVERY));
		expect(JSON.stringify(store.all())).not.toContain(AVERY);

		setOnline(true);
		await queue.setAccount(ROWAN);
		expect(queue.items).toEqual([]);
		await queue.flush();
		expect(send).not.toHaveBeenCalled();
		expect(store.all()).toHaveLength(1);

		await queue.setAccount(AVERY);
		expect(send).toHaveBeenCalledOnce();
		expect(store.all()).toEqual([]);
	});

	it('shows nothing once signed out, and keeps the queue for the next sign-in', async () => {
		const { queue, store, setOnline } = setup();
		setOnline(false);
		await queue.setAccount(AVERY);
		await queue.add({ own: OWN, body: body(), form });
		await queue.setAccount(null);
		expect(queue.items).toEqual([]);
		expect(store.all()).toHaveLength(1);
	});

	it('forget deletes only this account queue from the device', async () => {
		const { queue, store, setOnline } = setup();
		setOnline(false);
		await queue.setAccount(ROWAN);
		await queue.add({ own: 'P-EEEE-FFFF', body: body(), form });
		await queue.setAccount(AVERY);
		await queue.add({ own: OWN, body: body(), form });
		expect(queue.unsent).toBe(1);

		await queue.forget();
		expect(queue.items).toEqual([]);
		expect(store.all().map((i) => i.own)).toEqual(['P-EEEE-FFFF']);
	});
});

describe('OfflineQueue: each answer', () => {
	async function queued(outcome: SendOutcome) {
		const ctx = setup();
		ctx.setOnline(false);
		await ctx.queue.setAccount(AVERY);
		await ctx.queue.add({ own: OWN, body: body(), form });
		ctx.send.mockResolvedValue(outcome);
		ctx.setOnline(true);
		await ctx.queue.flush();
		return ctx;
	}

	it('2xx: removes it and says it was sent', async () => {
		const match = { code: CODE } as Match;
		const { queue, store, sent } = await queued({ kind: 'sent', match });
		expect(queue.items).toEqual([]);
		expect(store.all()).toEqual([]);
		expect(sent).toEqual([[{ code: CODE, match, duplicate: false }]]);
	});

	it('409 that names the match: counts as sent', async () => {
		const { queue, store, sent } = await queued({ kind: 'duplicate', code: CODE });
		expect(queue.items).toEqual([]);
		expect(store.all()).toEqual([]);
		expect(sent).toEqual([[{ code: CODE, match: null, duplicate: true }]]);
	});

	it('401: keeps it and waits for sign-in', async () => {
		const { queue, store, sent } = await queued({ kind: 'signin' });
		expect(queue.waiting).toHaveLength(1);
		expect(store.all()).toHaveLength(1);
		expect(queue.reason).toBe('signin');
		expect(sent).toEqual([]);
	});

	it('422: moves it to refused with the field errors, and keeps it until the player acts', async () => {
		const problem = {
			kind: 'invalid' as const,
			message: "Some details weren't accepted.",
			fields: { 'team_b.0': ['No player has this OPEN code.'] }
		};
		const { queue, store, send } = await queued({ kind: 'refused', problem });
		expect(queue.waiting).toEqual([]);
		expect(queue.refused).toHaveLength(1);
		expect(queue.refused[0].problem).toEqual(problem);
		expect(queue.refused[0].form).toEqual(form);
		expect(store.all()[0].problem).toEqual(problem);

		// A refused match is not sent again.
		await queue.flush();
		expect(send).toHaveBeenCalledOnce();
		expect(queue.unsent).toBe(1);

		await queue.remove(queue.refused[0].id);
		expect(store.all()).toEqual([]);
	});

	it('5xx: keeps it and tries again later', async () => {
		const { queue, store, send } = await queued({ kind: 'retry', offline: false });
		expect(queue.waiting).toHaveLength(1);
		expect(store.all()).toHaveLength(1);
		expect(queue.reason).toBe('retry');
		send.mockResolvedValue({ kind: 'sent', match: { code: CODE } as Match });
		await queue.flush();
		expect(store.all()).toEqual([]);
		expect(queue.reason).toBe('idle');
	});

	it('no answer: keeps it as offline', async () => {
		const { queue, store } = await queued({ kind: 'retry', offline: true });
		expect(store.all()).toHaveLength(1);
		expect(queue.reason).toBe('offline');
	});
});

describe('OfflineQueue: sending', () => {
	it('sends oldest first and stops at the first that must wait', async () => {
		const { queue, send, setOnline } = setup();
		setOnline(false);
		await queue.setAccount(AVERY);
		await queue.add({ own: OWN, body: body('2026-11-12'), form });
		await queue.add({ own: OWN, body: body('2026-11-13'), form });
		await queue.add({ own: OWN, body: body('2026-11-14'), form });
		expect(queue.waiting.map((i) => i.body.played_on)).toEqual([
			'2026-11-12',
			'2026-11-13',
			'2026-11-14'
		]);
		send
			.mockResolvedValueOnce({ kind: 'sent', match: null })
			.mockResolvedValueOnce({ kind: 'retry', offline: true });
		setOnline(true);
		await queue.flush();
		expect(send.mock.calls.map(([b]) => b.played_on)).toEqual(['2026-11-12', '2026-11-13']);
		expect(queue.waiting.map((i) => i.body.played_on)).toEqual(['2026-11-13', '2026-11-14']);
	});

	it('does not call the server while the browser says it is offline', async () => {
		const { queue, send, setOnline } = setup();
		setOnline(false);
		await queue.setAccount(AVERY);
		await queue.add({ own: OWN, body: body(), form });
		await queue.flush();
		expect(send).not.toHaveBeenCalled();
		expect(queue.reason).toBe('offline');
	});

	it('sends a match as soon as it is added when online', async () => {
		const { queue, send, store } = setup();
		await queue.setAccount(AVERY);
		await queue.add({ own: OWN, body: body(), form });
		await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
		await queue.flush();
		expect(store.all()).toEqual([]);
	});

	it('sends on the online event', async () => {
		const { queue, send, setOnline } = setup();
		setOnline(false);
		await queue.setAccount(AVERY);
		await queue.add({ own: OWN, body: body(), form });
		const target = new EventTarget();
		const stop = queue.start(target as unknown as Window);
		setOnline(true);
		target.dispatchEvent(new Event('online'));
		await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
		stop();
	});

	it('a send that ends after a sign out never puts the match back', async () => {
		const { queue, send, store } = setup();
		let answer: (o: SendOutcome) => void = () => {};
		send.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		await queue.setAccount(AVERY);
		await queue.add({ own: OWN, body: body(), form });
		await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
		await queue.forget();
		answer({ kind: 'refused', problem: { kind: 'refused', message: 'No.', fields: {} } });
		await queue.flush();
		expect(store.all()).toEqual([]);
		expect(queue.items).toEqual([]);
	});
});

describe('OfflineQueue: nothing is dropped silently', () => {
	it('rejects add when the device cannot store it, and keeps nothing in view', async () => {
		const broken: QueueStore = {
			list: async () => [],
			put: async () => Promise.reject(new Error('QuotaExceededError')),
			remove: async () => {},
			removeAccount: async () => {},
			listAll: async () => [],
			expire: async () => {},
			expiredCount: async () => 0,
			clearExpired: async () => {}
		};
		const { queue } = setup({ store: broken });
		await queue.setAccount(AVERY);
		await expect(queue.add({ own: OWN, body: body(), form })).rejects.toThrow();
		expect(queue.items).toEqual([]);
	});

	it('every outcome either keeps the match or says where it went', async () => {
		const outcomes: SendOutcome[] = [
			{ kind: 'sent', match: null },
			{ kind: 'duplicate', code: CODE },
			{ kind: 'refused', problem: { kind: 'refused', message: 'No.', fields: {} } },
			{ kind: 'signin' },
			{ kind: 'retry', offline: true },
			{ kind: 'retry', offline: false }
		];
		for (const outcome of outcomes) {
			const { queue, store, send, sent, setOnline } = setup();
			setOnline(false);
			await queue.setAccount(AVERY);
			await queue.add({ own: OWN, body: body(), form });
			send.mockResolvedValue(outcome);
			setOnline(true);
			await queue.flush();
			const kept = store.all().length;
			const announced = sent.flat().length;
			expect(kept + announced, outcome.kind).toBe(1);
			expect(queue.unsent, outcome.kind).toBe(kept);
		}
	});
});

describe('OfflineQueue: age limit', () => {
	const DAY = 24 * 60 * 60 * 1000;
	const NOW = Date.UTC(2026, 11, 20, 12, 0, 0);
	const item = (id: string, account: string, ageDays: number): QueuedMatch => ({
		id,
		account,
		own: OWN,
		body: body(),
		form,
		queuedAt: new Date(NOW - ageDays * DAY).toISOString(),
		problem: null
	});
	async function setupAged() {
		const store = memoryStore();
		const keyA = await accountKey(AVERY);
		const keyR = await accountKey(ROWAN);
		await store.put(item('a-old', keyA, 31));
		await store.put(item('a-new', keyA, 29));
		await store.put(item('r-old1', keyR, 45));
		await store.put(item('r-old2', keyR, 40));
		await store.put(item('r-new', keyR, 1));
		const ctx = setup({ store, now: () => new Date(NOW), online: () => false });
		return { ...ctx, keyA, keyR };
	}

	it('deletes old matches and keeps recent ones, for every account', async () => {
		const { queue, store } = await setupAged();
		await queue.purgeExpired();
		expect(
			store
				.all()
				.map((i) => i.id)
				.sort()
		).toEqual(['a-new', 'r-new']);
	});

	it('keeps a per-account count with no match data until that player signs in', async () => {
		const { queue, store, keyA, keyR } = await setupAged();
		await queue.purgeExpired();
		expect(store.counts()).toEqual({ [keyA]: 1, [keyR]: 2 });
		expect(JSON.stringify(store.counts())).not.toContain('example.test');
		expect(queue.expired).toBe(0);

		await queue.setAccount(ROWAN);
		expect(queue.expired).toBe(2);
		expect(queue.items.map((i) => i.id)).toEqual(['r-new']);
		await queue.dismissExpired();
		expect(queue.expired).toBe(0);
		// Avery's count is still waiting.
		expect(store.counts()).toEqual({ [keyA]: 1 });
	});

	it('tells the player once', async () => {
		const { queue, store } = await setupAged();
		await queue.setAccount(AVERY);
		expect(queue.expired).toBe(1);
		await queue.dismissExpired();
		await queue.setAccount(null);
		await queue.setAccount(AVERY);
		expect(queue.expired).toBe(0);
		expect(store.counts()).not.toHaveProperty(await accountKey(AVERY));
	});

	it('does not count a match twice when the cleanup runs again', async () => {
		const { queue, store, keyR } = await setupAged();
		await queue.purgeExpired();
		await queue.purgeExpired();
		expect(store.counts()[keyR]).toBe(2);
	});

	it('forget deletes the count too', async () => {
		const { queue, store } = await setupAged();
		await queue.setAccount(AVERY);
		await queue.forget();
		expect(store.counts()).not.toHaveProperty(await accountKey(AVERY));
	});
});
