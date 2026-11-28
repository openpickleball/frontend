import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import {
	endDeletedAccount,
	reauthPrompt,
	requestReauth,
	session,
	unsentMatches
} from '#lib/features/auth/index.js';
import { matchCache } from '#lib/features/matches/index.js';
import { createOfflineQueue, offlineQueue } from '#lib/features/offline/index.js';
import { myCode } from '#lib/features/players/index.js';
import RootLayout from './+layout.svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(), goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
// The auth service is not under test. Keep the real store, and stop the layout's own calls.
let mfaRequired: ((enrolled: boolean) => void) | null = null;
vi.mock('#lib/features/auth/services.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	watchSessionExpiry: vi.fn(() => () => {}),
	watchMfaRequired: vi.fn((notify: (enrolled: boolean) => void) => {
		mfaRequired = notify;
		return () => {
			mfaRequired = null;
		};
	})
}));

// The queue never reaches a backend here: every send waits for a connection.
vi.mock('#lib/features/offline/send.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	sendQueued: vi.fn(async () => ({ kind: 'retry', offline: true }))
}));

const children = createRawSnippet(() => ({ render: () => '<p>page</p>' }));
const props = { children, params: {}, data: {} };

let resetCode: ReturnType<typeof vi.spyOn>;
let resetCache: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	resetCode = vi.spyOn(myCode, 'reset');
	resetCache = vi.spyOn(matchCache, 'reset');
});

afterEach(() => {
	vi.restoreAllMocks();
	session.reset();
});

describe('root layout account switch', () => {
	it('does not clear anything for the first read of the session', async () => {
		await render(RootLayout, props);
		session.apply({ status: 'signed_in', email: 'a@example.com' });
		await vi.waitFor(() => expect(session.isSignedIn).toBe(true));
		await Promise.resolve();
		expect(resetCode).not.toHaveBeenCalled();
		expect(resetCache).not.toHaveBeenCalled();
	});

	it('clears the code and the match cache on sign out', async () => {
		session.apply({ status: 'signed_in', email: 'a@example.com' });
		await render(RootLayout, props);
		session.apply({ status: 'signed_out' });

		await vi.waitFor(() => expect(resetCode).toHaveBeenCalledOnce());
		expect(resetCache).toHaveBeenCalledOnce();
	});

	it('clears them when another account signs in on the same device', async () => {
		session.apply({ status: 'signed_in', email: 'a@example.com' });
		await render(RootLayout, props);
		session.apply({ status: 'signed_in', email: 'b@example.com' });

		await vi.waitFor(() => expect(resetCode).toHaveBeenCalledOnce());
		expect(resetCache).toHaveBeenCalledOnce();
	});

	it('leaves them alone when the same account is applied again', async () => {
		session.apply({ status: 'signed_in', email: 'a@example.com' });
		await render(RootLayout, props);
		session.apply({ status: 'signed_in', email: 'a@example.com' });
		await Promise.resolve();
		expect(resetCode).not.toHaveBeenCalled();
		expect(resetCache).not.toHaveBeenCalled();
	});
});

describe('root layout reauthentication prompt', () => {
	it('opens the one prompt when a call asks for a reauthentication', async () => {
		const screen = await render(RootLayout, props);
		const asked = requestReauth(['password']);
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		await screen.getByRole('button', { name: 'Cancel' }).click();
		expect(await asked).toBe(false);
	});
});

describe('root layout mfa_required notice', () => {
	afterEach(() => {
		toast.dismiss();
		reauthPrompt.settle(false);
	});

	it('explains it and links to the two-factor setup, once however often it comes', async () => {
		const screen = await render(RootLayout, props);
		mfaRequired?.(false);
		mfaRequired?.(false);
		await expect.element(screen.getByText('This needs two-factor authentication.')).toBeVisible();
		expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1);
		await screen.getByRole('button', { name: 'Set up two-factor' }).click();
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/profile/two-factor');
	});

	it('offers the code prompt to an account that has two-factor', async () => {
		const screen = await render(RootLayout, props);
		mfaRequired?.(true);
		await expect
			.element(screen.getByText('Confirm with a code from your authenticator app.'))
			.toBeVisible();
		await screen.getByRole('button', { name: 'Enter a code' }).click();
		await vi.waitFor(() => expect(reauthPrompt.request?.methods).toEqual(['code']));
	});
});

describe('root layout organizer entry', () => {
	const events = () => document.querySelectorAll('a[href="/organizer"]');

	it('shows Events in both navs only once the memberships say member, and drops it after', async () => {
		session.apply({ status: 'signed_in', email: 'organizer@example.com' });
		await render(RootLayout, props);
		// Unknown while the memberships load: no entry.
		expect(events()).toHaveLength(0);
		session.organizers = [
			{
				organizer: 'G-K7MQ-2RD4',
				name: 'Larkspur Paddle League',
				role: 'admin',
				verified: true,
				verification_requested: false
			}
		];
		await vi.waitFor(() => expect(events()).toHaveLength(2));
		session.organizers = [];
		await vi.waitFor(() => expect(events()).toHaveLength(0));
	});
});

describe('root layout account deletion', () => {
	// A made-up account, and a match it recorded on this device that was not sent.
	const EMAIL = 'quill@example.com';
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
	});

	it("deletes the account's unsent matches from the device, after telling the dialog the count", async () => {
		session.apply({ status: 'signed_in', email: EMAIL });
		await render(RootLayout, props);
		await vi.waitFor(() => offlineQueue.add(match));
		expect(offlineQueue.unsent).toBe(1);
		expect(unsentMatches()).toBe(1);

		endDeletedAccount();

		expect(session.isSignedIn).toBe(false);
		expect(session.accountDeleted).toBe('deleted');
		expect(offlineQueue.unsent).toBe(0);
		expect(unsentMatches()).toBe(0);
		await vi.waitFor(async () => expect((await readAgain()).unsent).toBe(0));
	});
});
