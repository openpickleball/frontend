/**
 * The delete dialog when the delete's answer was lost but the account looks gone (plan
 * `delete-account`, criterion 6): it goes to sign in, as after a 204.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { goto } from '$app/navigation';
import * as services from '../services.js';
import { session } from '../session.svelte.js';
import DeleteAccountDialog from './delete-account-dialog.svelte';

// The service has its own tests against the mock API. Here it is a stand-in.
vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	deleteAccount: vi.fn(),
	unsentMatches: vi.fn(() => 0)
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
const mocked = vi.mocked(services);

const dialog = () => page.getByRole('alertdialog', { name: 'Delete your account?' });

beforeEach(() => {
	session.apply({ status: 'signed_in', email: 'player@example.com' });
});

afterEach(() => {
	vi.mocked(goto).mockClear();
	mocked.deleteAccount.mockReset();
	session.reset();
});

it('goes to sign in when the account may have been deleted', async () => {
	mocked.deleteAccount.mockResolvedValue('maybe');
	await render(DeleteAccountDialog, { open: true });
	await dialog().getByLabelText('Type delete to confirm').fill('delete');
	await dialog().getByRole('button', { name: 'Delete account' }).click();
	await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/account/login'));
	await expect.element(dialog().getByRole('alert')).not.toBeInTheDocument();
});
