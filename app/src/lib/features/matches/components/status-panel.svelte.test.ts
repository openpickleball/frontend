import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { BEA, TAMSIN, sampleMatch } from '../testing.js';
import StatusPanel from './status-panel.svelte';

const handlers = () => ({ onconfirm: vi.fn(), ondispute: vi.fn() });

describe('StatusPanel', () => {
	describe('a pending match the player is in', () => {
		it('asks if the score is right and offers Confirm and Dispute', async () => {
			const h = handlers();
			const screen = await render(StatusPanel, { match: sampleMatch(), you: TAMSIN, ...h });
			await expect
				.element(screen.getByRole('heading', { name: 'Is this the right score?' }))
				.toBeVisible();
			await expect
				.element(screen.getByText('Already confirmed? Confirming again changes nothing.'))
				.toBeVisible();
			await screen.getByRole('button', { name: 'Confirm score' }).click();
			expect(h.onconfirm).toHaveBeenCalledOnce();
			await screen.getByRole('button', { name: 'Dispute' }).click();
			expect(h.ondispute).toHaveBeenCalledOnce();
		});

		it('offers both to a player on the other team too', async () => {
			const screen = await render(StatusPanel, {
				match: sampleMatch(),
				you: BEA,
				...handlers()
			});
			await expect.element(screen.getByRole('button', { name: 'Confirm score' })).toBeVisible();
			await expect.element(screen.getByRole('button', { name: 'Dispute' })).toBeVisible();
		});

		it('does not claim the player has not confirmed, or has', async () => {
			const screen = await render(StatusPanel, {
				match: sampleMatch(),
				you: TAMSIN,
				...handlers()
			});
			await expect.element(screen.getByText(/waiting for the other team/i)).not.toBeInTheDocument();
			await expect.element(screen.getByText(/you confirmed/i)).not.toBeInTheDocument();
		});

		it('waits while an action is in flight', async () => {
			const screen = await render(StatusPanel, {
				match: sampleMatch(),
				you: TAMSIN,
				busy: 'confirm',
				...handlers()
			});
			await expect.element(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
			await expect.element(screen.getByRole('button', { name: 'Dispute' })).toBeDisabled();
		});

		it('shows why the last action failed', async () => {
			const screen = await render(StatusPanel, {
				match: sampleMatch(),
				you: TAMSIN,
				error: "We couldn't confirm the score. Try again.",
				...handlers()
			});
			await expect
				.element(screen.getByRole('alert'))
				.toHaveTextContent("We couldn't confirm the score. Try again.");
			await expect.element(screen.getByRole('button', { name: 'Confirm score' })).toBeVisible();
		});
	});

	describe('after the player confirmed in this session (or recorded the match)', () => {
		it('says it is waiting for the other team and offers no buttons', async () => {
			const screen = await render(StatusPanel, {
				match: sampleMatch(),
				you: TAMSIN,
				acted: 'confirm',
				...handlers()
			});
			await expect
				.element(screen.getByRole('heading', { name: 'Waiting for the other team' }))
				.toBeVisible();
			await expect.element(screen.getByText(/You confirmed this score/)).toBeVisible();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});
	});

	describe('a pending match the player is not in', () => {
		it('says it waits for confirmation, with no buttons', async () => {
			const other = sampleMatch();
			// Nobody on the page is this code.
			const screen = await render(StatusPanel, {
				match: other,
				you: 'P-0000-0000' as never,
				...handlers()
			});
			await expect
				.element(screen.getByRole('heading', { name: 'Waiting for confirmation' }))
				.toBeVisible();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});
	});

	for (const [status, title, text] of [
		['confirmed', 'Confirmed', /This score is confirmed\. It counts in your match history/],
		['disputed', 'Disputed', /No one can confirm it while it is disputed/],
		['voided', 'Voided', /This match was voided/]
	] as const) {
		it(`explains a ${status} match, with no buttons even after a confirm`, async () => {
			const screen = await render(StatusPanel, {
				match: sampleMatch({ status }),
				you: TAMSIN,
				acted: 'confirm',
				...handlers()
			});
			await expect.element(screen.getByRole('heading', { name: title })).toBeVisible();
			await expect.element(screen.getByText(text)).toBeVisible();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});
	}

	it('uses no em dashes in any of its copy', async () => {
		for (const status of ['pending', 'confirmed', 'disputed', 'voided'] as const) {
			const screen = await render(StatusPanel, {
				match: sampleMatch({ status }),
				you: TAMSIN,
				...handlers()
			});
			expect(screen.container.textContent).not.toContain('—');
		}
	});
});
