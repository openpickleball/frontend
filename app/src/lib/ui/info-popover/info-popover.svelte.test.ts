import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { InfoPopover } from './index.js';

const props = {
	label: 'What does disputed mean?',
	terms: [{ term: 'Disputed', text: 'A player said the score is wrong.' }]
};

function button() {
	return page.getByRole('button', { name: 'What does disputed mean?' });
}

function popover() {
	return page.getByRole('dialog', { name: 'What does disputed mean?' });
}

describe('InfoPopover', () => {
	it('is an info button named for what it explains, closed at first', async () => {
		await render(InfoPopover, props);
		await expect.element(button()).toBeVisible();
		await expect.element(button()).toHaveAttribute('aria-expanded', 'false');
		await expect.element(popover()).not.toBeInTheDocument();
	});

	it('has a 44px tap target (size-11) around a 20px icon (size-5)', async () => {
		await render(InfoPopover, props);
		// The styles are not loaded here, so this checks the Tailwind classes.
		await expect.element(button()).toHaveClass('size-11');
		expect(button().element().querySelector('svg')?.classList.contains('size-5')).toBe(true);
	});

	it('opens on a click, shows each term, and closes on a second click', async () => {
		await render(InfoPopover, props);
		await button().click();
		await expect.element(popover()).toBeVisible();
		await expect.element(button()).toHaveAttribute('aria-expanded', 'true');
		await expect.element(popover().getByText('Disputed', { exact: true })).toBeVisible();
		await expect.element(popover().getByText('A player said the score is wrong.')).toBeVisible();

		await button().click();
		await expect.element(popover()).not.toBeInTheDocument();
	});

	it('opens on Enter and on Space, and Escape closes it and gives focus back', async () => {
		await render(InfoPopover, props);
		await userEvent.tab();
		await expect.element(button()).toHaveFocus();

		await userEvent.keyboard('{Enter}');
		await expect.element(popover()).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(popover()).not.toBeInTheDocument();
		await expect.element(button()).toHaveFocus();

		await userEvent.keyboard(' ');
		await expect.element(popover()).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(popover()).not.toBeInTheDocument();
		await expect.element(button()).toHaveFocus();
	});

	it('opens below the button when there is room', async () => {
		await render(InfoPopover, props);
		await button().click();
		await expect.element(popover()).toHaveAttribute('data-side', 'bottom');
	});

	it('does not open on hover', async () => {
		await render(InfoPopover, props);
		await button().hover();
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect.element(popover()).not.toBeInTheDocument();
	});
});
