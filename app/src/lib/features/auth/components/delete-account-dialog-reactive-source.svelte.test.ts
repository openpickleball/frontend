/**
 * Defect: the dialog's open reset read `unsentMatches()`, whose source reads reactive state (the
 * root layout's is `offlineQueue.unsent`). So any change to that state while the dialog was open
 * ran the reset again, which wiped the typed word and any error shown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { toAppError } from '#lib/api/index.js';
import * as services from '../services.js';
import { session } from '../session.svelte.js';
import DeleteAccountDialog from './delete-account-dialog.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	deleteAccount: vi.fn()
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
const mocked = vi.mocked(services);

const THROTTLED = 'Too many attempts. Wait a moment and try again.';

/** A reactive stand-in for the offline queue's unsent count. */
const queue = new SvelteMap<'unsent', number>([['unsent', 0]]);
let removeSource: () => void = () => {};

const dialog = () => page.getByRole('alertdialog', { name: 'Delete your account?' });

beforeEach(() => {
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	queue.set('unsent', 0);
	removeSource = services.setUnsentMatchesSource(() => queue.get('unsent') ?? 0);
});

afterEach(() => {
	removeSource();
	mocked.deleteAccount.mockReset();
	session.reset();
});

describe('DeleteAccountDialog when the unsent count changes while it is open', () => {
	it('keeps the typed word', async () => {
		await render(DeleteAccountDialog, { open: true });
		const word = dialog().getByLabelText('Type delete to confirm');
		await word.fill('delete');
		queue.set('unsent', 1);
		flushSync();
		await expect.element(word).toHaveValue('delete');
		await expect.element(dialog().getByRole('button', { name: 'Delete account' })).toBeEnabled();
	});

	it('keeps the error it shows', async () => {
		mocked.deleteAccount.mockRejectedValue(
			toAppError(
				{ code: 'throttled', message: 'x', errors: [] },
				new Response(null, { status: 429 })
			)
		);
		await render(DeleteAccountDialog, { open: true });
		await dialog().getByLabelText('Type delete to confirm').fill('delete');
		await dialog().getByRole('button', { name: 'Delete account' }).click();
		await expect.element(dialog().getByRole('alert')).toHaveTextContent(THROTTLED);
		queue.set('unsent', 2);
		flushSync();
		await expect.element(dialog().getByRole('alert')).toHaveTextContent(THROTTLED);
	});
});
