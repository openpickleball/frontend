/**
 * A 401 on the DELETE itself, from the dialog to the sign-in notice (plan `delete-account`,
 * criteria 4 and 5). The account may be gone, so sign in says it may have been deleted, never
 * "You were signed out.". The same 401 also wakes the session watcher, whose `invalidateAll()`
 * lets the guard send the player to sign in. Here the watcher runs the real guard for /profile,
 * so both navigations happen: the dialog's `goto` and the guard's redirect. Both land on the
 * sign-in page, whose notice reads only the session store, so the store's final state is what
 * the player sees. The sign-in form is rendered before the delete starts and stays mounted, so
 * it shows the notice whichever navigation lands first.
 *
 * The real services and the real API client run here, with a stand-in `fetch` for the backend:
 * the mock service worker can't answer a DELETE with a 401 for one test.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { goto } from '$app/navigation';
import { enforceGuard } from '../index.js';
import { bootstrap, resetBootstrap, watchSessionExpiry } from '../services.js';
import { session } from '../session.svelte.js';
import DeleteAccountDialog from './delete-account-dialog.svelte';
import LoginForm from './login-form.svelte';

// A made-up account.
const EMAIL = 'wren@example.com';

const backend = vi.hoisted(() => ({ signedIn: true }));

/** The backend: the account's session until the DELETE, which answers 401 and ends it. */
const fakeFetch = vi.hoisted(() => async (input: RequestInfo | URL, init?: RequestInit) => {
	const request = new Request(input, init);
	const { pathname } = new URL(request.url);
	const json = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	if (pathname === '/api/v1/accounts/me' && request.method === 'DELETE') {
		backend.signedIn = false;
		return json(401, { code: 'unauthorized', message: 'Sign in first.' });
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
let stopWatching: () => void;

beforeEach(async () => {
	backend.signedIn = true;
	resetBootstrap();
	session.reset();
	// The app read the session when it opened, so the guard does not read it again.
	await bootstrap();
	expect(session.email).toBe(EMAIL);
	redirects = [];
	// What the root layout's `invalidateAll()` leads to on /profile: the guard runs again.
	stopWatching = watchSessionExpiry(() => {
		void enforceGuard(new URL('http://localhost/profile')).then(
			() => redirects.push('none'),
			(thrown: { location?: string }) => redirects.push(thrown.location ?? 'error')
		);
	});
});

afterEach(() => {
	stopWatching();
	vi.mocked(goto).mockClear();
	session.reset();
	resetBootstrap();
});

it('shows the maybe deleted notice, not "You were signed out.", after a 401 on the DELETE', async () => {
	const login = await render(LoginForm, { onsuccess: vi.fn() });
	await render(DeleteAccountDialog, { open: true });
	await dialog().getByLabelText('Type delete to confirm').fill('delete');
	await dialog().getByRole('button', { name: 'Delete account' }).click();

	await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/account/login'));
	await vi.waitFor(() => expect(redirects).toEqual(['/account/login?next=%2Fprofile']));

	expect(session.accountDeleted).toBe('maybe');
	expect(session.expired).toBe(false);
	await expect.element(login.getByText('Your account may have been deleted.')).toBeVisible();
	await expect.element(login.getByText('You were signed out.')).not.toBeInTheDocument();
	await expect.element(login.getByText('Your account was deleted.')).not.toBeInTheDocument();
});
