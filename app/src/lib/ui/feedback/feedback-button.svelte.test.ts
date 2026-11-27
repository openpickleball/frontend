import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import FeedbackButton from './feedback-button.svelte';

// A blank page stands in for the form, so the tests never reach Tally.
const BLANK = 'about:blank';

const LOADED = JSON.stringify({ event: 'Tally.FormLoaded', payload: { formId: 'EqWB5B' } });

function frame() {
	return document.querySelector<HTMLIFrameElement>('iframe[title="Feedback form"]');
}

/** What Tally's embed posts once the form is there. */
function postLoaded(origin = 'https://tally.so', source = frame()?.contentWindow ?? null) {
	window.dispatchEvent(new MessageEvent('message', { data: LOADED, origin, source }));
}

describe('FeedbackButton', () => {
	afterEach(() => {
		Reflect.deleteProperty(navigator, 'onLine');
	});

	it('adds the form iframe only once the dialog opens', async () => {
		const screen = await render(FeedbackButton, { formUrl: BLANK });
		await expect.element(screen.getByRole('button', { name: 'Send feedback' })).toBeVisible();
		expect(frame()).toBeNull();

		await screen.getByRole('button', { name: 'Send feedback' }).click();
		await expect.element(page.getByRole('dialog', { name: 'Send feedback' })).toBeVisible();
		const iframe = frame();
		expect(iframe).not.toBeNull();
		expect(iframe?.getAttribute('src')).toBe(BLANK);
		expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer');
		expect(iframe?.getAttribute('sandbox')).toBe(
			'allow-scripts allow-forms allow-same-origin allow-popups'
		);
	});

	it('shows no title or description of its own, only the form and a close button', async () => {
		const screen = await render(FeedbackButton, { formUrl: BLANK });
		await screen.getByRole('button', { name: 'Send feedback' }).click();
		const dialog = page.getByRole('dialog', { name: 'Send feedback' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByText('Send feedback')).toHaveClass('sr-only');
		await expect.element(dialog).not.toHaveAttribute('aria-describedby');
		await expect.element(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
		await expect.element(dialog).toHaveClass('bg-white');
	});

	it('shows the form once Tally says it loaded, and only from Tally', async () => {
		const screen = await render(FeedbackButton, { formUrl: BLANK });
		await screen.getByRole('button', { name: 'Send feedback' }).click();
		await expect.element(page.getByText('Loading the form')).toBeVisible();

		postLoaded('https://example.org');
		await expect.element(page.getByText('Loading the form')).toBeVisible();

		postLoaded();
		await expect.element(page.getByText('Loading the form')).not.toBeInTheDocument();
		await expect.element(page.getByTitle('Feedback form')).toBeVisible();
	});

	it('closes with Escape and gives focus back to the button', async () => {
		const screen = await render(FeedbackButton, { formUrl: BLANK });
		const button = screen.getByRole('button', { name: 'Send feedback' });
		await button.click();
		await expect.element(page.getByRole('dialog')).toBeVisible();

		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(frame()).toBeNull();
		await expect.element(button).toHaveFocus();
	});

	it('closes with the Close button and gives focus back to the button', async () => {
		const screen = await render(FeedbackButton, { formUrl: BLANK });
		const button = screen.getByRole('button', { name: 'Send feedback' });
		await button.click();
		await page.getByRole('button', { name: 'Close' }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(button).toHaveFocus();
	});

	it('offers the form in a new tab when it does not load in time', async () => {
		const screen = await render(FeedbackButton, { formUrl: BLANK, timeout: 50 });
		await screen.getByRole('button', { name: 'Send feedback' }).click();
		const link = page.getByRole('link', {
			name: 'open the form in a new tab (opens in a new tab)'
		});
		await expect.element(link).toBeVisible();
		await expect.element(link).toHaveAttribute('href', 'https://tally.so/r/EqWB5B');
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noopener');
		expect(frame()).toBeNull();
	});

	it('offers the new-tab link at once when the device is offline', async () => {
		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
		const screen = await render(FeedbackButton, { formUrl: BLANK });
		await screen.getByRole('button', { name: 'Send feedback' }).click();
		await expect.element(page.getByTestId('feedback-fallback')).toBeVisible();
		expect(frame()).toBeNull();
	});
});
