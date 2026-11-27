import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import { reauthPrompt, requestReauth, session } from '#lib/features/auth/index.js';
import { matchCache } from '#lib/features/matches/index.js';
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
