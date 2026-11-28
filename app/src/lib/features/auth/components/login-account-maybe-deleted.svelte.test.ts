/**
 * The sign-in notice after a delete whose answer was unclear (plan `delete-account`, criterion 6):
 * a lost answer, a 5xx, or a 401 after such a try. The account may be gone, and signing in tells
 * the player which.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { session } from '../session.svelte.js';
import LoginForm from './login-form.svelte';

// The service has its own tests against the mock API. Here it is a stand-in.
vi.mock('../services.js', () => ({
	login: vi.fn(),
	authenticateMfa: vi.fn(),
	cancelMfa: vi.fn()
}));

const MAYBE = 'Your account may have been deleted.';
const MAYBE_MORE =
	"We couldn't confirm it before you were signed out. Sign in to check: if your account is gone, sign-in won't work.";

beforeEach(() => {
	session.apply({ status: 'signed_in', email: 'player@example.com' });
});

afterEach(() => {
	session.reset();
});

it('says the account may have been deleted, and not that it was or that the player was signed out', async () => {
	// The services module is mocked here, so this is the store call the lost answer makes.
	session.markDeleted('maybe');
	const screen = await render(LoginForm, { onsuccess: vi.fn() });
	await expect.element(screen.getByText(MAYBE)).toBeVisible();
	await expect.element(screen.getByText(MAYBE_MORE)).toBeVisible();
	await expect.element(screen.getByText('Your account was deleted.')).not.toBeInTheDocument();
	await expect.element(screen.getByText('You were signed out.')).not.toBeInTheDocument();
});

it('keeps the deleted notice for a 204', async () => {
	session.markDeleted('deleted');
	const screen = await render(LoginForm, { onsuccess: vi.fn() });
	await expect.element(screen.getByText('Your account was deleted.')).toBeVisible();
	await expect
		.element(screen.getByText('You can sign up again with the same email address as a new player.'))
		.toBeVisible();
	await expect.element(screen.getByText(MAYBE)).not.toBeInTheDocument();
});
