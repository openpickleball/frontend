/**
 * The root layout's cleanup when a 401 expired the session before the delete's 204 was handled
 * (plan `delete-account`, criterion 5). The queue already shows nobody, so the cleanup must
 * delete the queue of the email it is given.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { endDeletedAccount, session } from '#lib/features/auth/index.js';
import { createOfflineQueue, offlineQueue } from '#lib/features/offline/index.js';
import RootLayout from './+layout.svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(), goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
// The auth service is not under test. Keep the real store, and stop the layout's own calls.
vi.mock('#lib/features/auth/services.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	watchSessionExpiry: vi.fn(() => () => {}),
	watchMfaRequired: vi.fn(() => () => {})
}));
// The queue never reaches a backend here: every send waits for a connection.
vi.mock('#lib/features/offline/send.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	sendQueued: vi.fn(async () => ({ kind: 'retry', offline: true }))
}));

const children = createRawSnippet(() => ({ render: () => '<p>page</p>' }));
const props = { children, params: {}, data: {} };

// A made-up account, and a match it recorded on this device that was not sent.
const EMAIL = 'wren@example.com';
const match = {
	own: 'P-AAAA-BBBB',
	body: {
		format: 'singles' as const,
		played_on: '2026-11-14',
		team_a: ['P-AAAA-BBBB'],
		team_b: ['P-CCCC-DDDD'],
		games: [{ team_a: 11, team_b: 6 }]
	},
	form: { format: 'singles' }
};
/** A second queue on the same device storage, as a reload of the app would read it. */
const readAgain = async () => {
	const queue = createOfflineQueue({ send: async () => ({ kind: 'retry', offline: true }) });
	await queue.setAccount(EMAIL);
	return queue;
};

afterEach(async () => {
	await offlineQueue.setAccount(null);
	await (await readAgain()).forget();
	vi.restoreAllMocks();
	session.reset();
});

it("deletes the deleted account's queue when a 401 had already signed it out", async () => {
	session.apply({ status: 'signed_in', email: EMAIL });
	await render(RootLayout, props);
	await vi.waitFor(() => offlineQueue.add(match));
	expect(offlineQueue.unsent).toBe(1);

	// A request that raced the delete got its 401 first.
	session.expire();
	await vi.waitFor(() => expect(offlineQueue.unsent).toBe(0));
	expect((await readAgain()).unsent).toBe(1);

	// Then the 204: the service hands on the email it captured before sending the delete.
	endDeletedAccount(EMAIL);

	expect(session.accountDeleted).toBeTruthy();
	await vi.waitFor(async () => expect((await readAgain()).unsent).toBe(0));
});
