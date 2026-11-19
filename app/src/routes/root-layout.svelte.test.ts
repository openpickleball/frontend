import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { session } from '#lib/features/auth/index.js';
import { matchCache } from '#lib/features/matches/index.js';
import { myCode } from '#lib/features/players/index.js';
import RootLayout from './+layout.svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
// The auth service is not under test. Keep the real store, and stop the layout's own calls.
vi.mock('#lib/features/auth/services.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	watchSessionExpiry: vi.fn(() => () => {})
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
