/**
 * A 401 on the first DELETE is a plain expiry (plan `delete-account`, criteria 4 and 5). The
 * session already ended on the backend (an idle timeout, or a sign out on another device), so the
 * backend refused the DELETE and deleted nothing. Nothing on this device may be deleted for it:
 * no `onSignOut` listener runs, so the root layout keeps the offline queue of unsent matches. The
 * session watcher's expiry stands, and sign in says "You were signed out.".
 *
 * The real services and the real API client run here, with a stand-in `fetch` for the backend:
 * the mock service worker can't answer a DELETE with a 401 for one test.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { goto } from '$app/navigation';
import { enforceGuard } from '../index.js';
import { bootstrap, onSignOut, resetBootstrap, watchSessionExpiry } from '../services.js';
import { session } from '../session.svelte.js';
import DeleteAccountDialog from './delete-account-dialog.svelte';
import LoginForm from './login-form.svelte';

// A made-up account.
const EMAIL = 'wren@example.com';

const backend = vi.hoisted(() => ({ signedIn: true }));

/** The backend: the account's session until it ends there, then every DELETE answers 401. */
const fakeFetch = vi.hoisted(() => async (input: RequestInfo | URL, init?: RequestInit) => {
	const request = new Request(input, init);
	const { pathname } = new URL(request.url);
	const json = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	if (pathname === '/api/v1/accounts/me' && request.method === 'DELETE') {
		return backend.signedIn
			? new Response(null, { status: 204 })
			: json(401, { code: 'unauthorized', message: 'Sign in first.' });
	}
	if (pathname === '/_allauth/browser/v1/auth/session') {
		return backend.signedIn
			? json(200, { status: 200, data: { user: { email: 'wren@example.com' }, methods: [] } })
			: json(401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: {} });
	}
	return json(404, { code: 'not_found', message: 'Not found.' });
});

vi.mock('#lib/api/index.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('#lib/api/index.js')>();
	return {
		...original,
		api: original.createApi({ fetch: fakeFetch, getCookies: () => 'csrftoken=made-up-token' })
	};
});
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}), invalidateAll: vi.fn() }));

const dialog = () => page.getByRole('alertdialog', { name: 'Delete your account?' });

let redirects: string[];
let heard: (string | null)[];
let stops: (() => void)[];

beforeEach(async () => {
	backend.signedIn = true;
	resetBootstrap();
	session.reset();
	// The app read the session when it opened, so the guard does not read it again.
	await bootstrap();
	expect(session.email).toBe(EMAIL);
	redirects = [];
	heard = [];
	stops = [
		// What the root layout's listener stands for: it deletes the account's offline queue.
		onSignOut((email) => heard.push(email)),
		// What the root layout's `invalidateAll()` leads to on /profile: the guard runs again.
		watchSessionExpiry(() => {
			void enforceGuard(new URL('http://localhost/profile')).then(
				() => redirects.push('none'),
				(thrown: { location?: string }) => redirects.push(thrown.location ?? 'error')
			);
		})
	];
});

afterEach(() => {
	for (const stop of stops) stop();
	vi.mocked(goto).mockClear();
	session.reset();
	resetBootstrap();
});

it('keeps the unsent matches and says "You were signed out." after a first-try 401', async () => {
	const login = await render(LoginForm, { onsuccess: vi.fn() });
	await render(DeleteAccountDialog, { open: true });
	await dialog().getByLabelText('Type delete to confirm').fill('delete');

	// The session ends on the backend before the player presses the button.
	backend.signedIn = false;
	await dialog().getByRole('button', { name: 'Delete account' }).click();

	await vi.waitFor(() => expect(redirects).toEqual(['/account/login?next=%2Fprofile']));
	expect(heard).toEqual([]);
	expect(session.isSignedIn).toBe(false);
	expect(session.accountDeleted).toBeNull();
	expect(session.expired).toBe(true);

	// The delete throws the 401, so the dialog does not go to sign in itself: the guard does.
	await expect
		.element(dialog().getByText("You're not signed in. Sign in, then try again."))
		.toBeVisible();
	expect(goto).not.toHaveBeenCalled();
	await expect.element(login.getByText('You were signed out.')).toBeVisible();
	await expect
		.element(login.getByText('Your account may have been deleted.'))
		.not.toBeInTheDocument();
	await expect.element(login.getByText('Your account was deleted.')).not.toBeInTheDocument();
});
