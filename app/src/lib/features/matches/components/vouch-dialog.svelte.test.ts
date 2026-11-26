import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import VouchDialog from './vouch-dialog.svelte';

describe('VouchDialog', () => {
	it('says before the vouch that it cannot be undone, and names no other match', async () => {
		await render(VouchDialog, { open: true, onconfirm: vi.fn() });
		const dialog = page.getByRole('alertdialog', { name: 'Vouch for this match?' });
		await expect.element(dialog).toBeVisible();
		await expect
			.element(dialog.getByText(/separate match, not a repeat of the other one/))
			.toBeVisible();
		await expect.element(dialog.getByText(/You can't undo a vouch/)).toBeVisible();
		await expect.element(dialog.getByText(/M-/)).not.toBeInTheDocument();
		await expect.element(dialog.getByRole('textbox')).not.toBeInTheDocument();
	});

	it('opens with focus on Cancel, the safe choice', async () => {
		await render(VouchDialog, { open: true, onconfirm: vi.fn() });
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
	});

	it('Cancel and Escape close the dialog and vouch for nothing', async () => {
		const onconfirm = vi.fn();
		const onclosed = vi.fn();
		const screen = await render(VouchDialog, { open: true, onconfirm, onclosed });
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
		expect(onclosed).toHaveBeenCalledOnce();

		await screen.rerender({ open: true, onconfirm, onclosed });
		await expect.element(page.getByRole('alertdialog')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('"Vouch for match" vouches once and closes the dialog', async () => {
		const onconfirm = vi.fn();
		await render(VouchDialog, { open: true, onconfirm });
		await page.getByRole('button', { name: 'Vouch for match' }).click();
		expect(onconfirm).toHaveBeenCalledOnce();
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
	});
});
