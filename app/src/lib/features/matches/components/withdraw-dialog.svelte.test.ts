import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import WithdrawDialog from './withdraw-dialog.svelte';

describe('WithdrawDialog', () => {
	it('says before the withdraw that the player cannot dispute the match again', async () => {
		await render(WithdrawDialog, { open: true, onconfirm: vi.fn() });
		const dialog = page.getByRole('alertdialog', { name: 'Withdraw your dispute?' });
		await expect.element(dialog).toBeVisible();
		await expect
			.element(dialog.getByText(/You can't dispute this match again after you withdraw/))
			.toBeVisible();
		await expect.element(dialog.getByRole('textbox')).not.toBeInTheDocument();
	});

	it('keeps "Withdraw dispute" in the danger color', async () => {
		await render(WithdrawDialog, { open: true, onconfirm: vi.fn() });
		const button = page.getByRole('button', { name: 'Withdraw dispute' }).element();
		expect(button.className).toContain('bg-danger');
	});

	it('opens with focus on Cancel, the safe choice', async () => {
		await render(WithdrawDialog, { open: true, onconfirm: vi.fn() });
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
	});

	it('Cancel and Escape close the dialog and withdraw nothing', async () => {
		const onconfirm = vi.fn();
		const onclosed = vi.fn();
		const screen = await render(WithdrawDialog, { open: true, onconfirm, onclosed });
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
		expect(onclosed).toHaveBeenCalledOnce();

		await screen.rerender({ open: true, onconfirm, onclosed });
		await expect.element(page.getByRole('alertdialog')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('"Withdraw dispute" withdraws once and closes the dialog', async () => {
		const onconfirm = vi.fn();
		await render(WithdrawDialog, { open: true, onconfirm });
		await page.getByRole('button', { name: 'Withdraw dispute' }).click();
		expect(onconfirm).toHaveBeenCalledOnce();
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
	});
});
