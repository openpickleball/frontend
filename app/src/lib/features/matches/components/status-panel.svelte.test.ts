import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { sampleMatch, viewerMatch } from '../testing.js';
import StatusPanel from './status-panel.svelte';

const handlers = () => ({ onconfirm: vi.fn(), ondispute: vi.fn() });

describe('StatusPanel', () => {
	it('says the player just recorded the match, only when told to', async () => {
		const screen = await render(StatusPanel, {
			match: viewerMatch(),
			recorded: true,
			...handlers()
		});
		await expect.element(screen.getByText('You just recorded this match.')).toBeVisible();
		screen.unmount();
		const other = await render(StatusPanel, { match: viewerMatch(), ...handlers() });
		await expect.element(other.getByText('You just recorded this match.')).not.toBeInTheDocument();
	});

	describe("a pending match where the player's team has not confirmed", () => {
		it('asks if the score is right and offers Confirm and Dispute', async () => {
			const h = handlers();
			const screen = await render(StatusPanel, { match: viewerMatch(), ...h });
			await expect
				.element(screen.getByRole('heading', { name: 'Is this the right score?' }))
				.toBeVisible();
			await screen.getByRole('button', { name: 'Confirm score' }).click();
			expect(h.onconfirm).toHaveBeenCalledOnce();
			await screen.getByRole('button', { name: 'Dispute' }).click();
			expect(h.ondispute).toHaveBeenCalledOnce();
		});

		it('says neither team has confirmed', async () => {
			const screen = await render(StatusPanel, { match: viewerMatch(), ...handlers() });
			await expect
				.element(screen.getByText(/Neither team has confirmed this score yet/))
				.toBeVisible();
		});

		it('says the other team has confirmed', async () => {
			const screen = await render(StatusPanel, { match: viewerMatch({ b: true }), ...handlers() });
			await expect
				.element(screen.getByText(/The other team has confirmed this score. Your team has not./))
				.toBeVisible();
		});

		it('reads the other team from the side the player is on', async () => {
			const match = viewerMatch({ a: true, b: false }, { viewerSide: 'b' });
			const screen = await render(StatusPanel, { match, ...handlers() });
			await expect.element(screen.getByText(/The other team has confirmed/)).toBeVisible();
			await expect.element(screen.getByRole('button', { name: 'Confirm score' })).toBeVisible();
		});

		it('waits while an action is in flight', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch(),
				busy: 'confirm',
				...handlers()
			});
			const confirming = screen.getByRole('button', { name: 'Confirming…' });
			await expect.element(confirming).toHaveAttribute('aria-disabled', 'true');
			await expect.element(confirming).toHaveAttribute('aria-busy', 'true');
			expect(confirming.element().querySelector('svg[aria-hidden="true"]')).not.toBeNull();
			await expect
				.element(screen.getByRole('button', { name: 'Dispute' }))
				.toHaveAttribute('aria-disabled', 'true');
		});

		it.each([
			['Confirm score', 'confirm'],
			['Dispute', 'dispute']
		] as const)(
			'ignores a second click on %s while busy and keeps focus on it',
			async (name, busy) => {
				const h = handlers();
				const screen = await render(StatusPanel, { match: viewerMatch(), busy, ...h });
				const button = screen
					.getByRole('button', { name: busy === 'confirm' ? 'Confirming…' : name })
					.element() as HTMLButtonElement;
				button.focus();
				// A DOM click, as Enter or Space on the focused button sends it.
				button.click();
				button.click();
				expect(h.onconfirm).not.toHaveBeenCalled();
				expect(h.ondispute).not.toHaveBeenCalled();
				expect(document.activeElement).toBe(button);
				expect(button.disabled).toBe(false);
			}
		);

		it('shows why the last action failed', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch(),
				error: "We couldn't confirm the score. Try again.",
				...handlers()
			});
			await expect
				.element(screen.getByRole('alert'))
				.toHaveTextContent("We couldn't confirm the score. Try again.");
			await expect.element(screen.getByRole('button', { name: 'Confirm score' })).toBeVisible();
		});
	});

	describe("a pending match where the player's team has confirmed", () => {
		it('says the player confirmed and offers no buttons', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ a: true, decision: 'confirm' }),
				...handlers()
			});
			await expect
				.element(screen.getByRole('heading', { name: 'Waiting for the other team' }))
				.toBeVisible();
			await expect.element(screen.getByText(/You confirmed this score/)).toBeVisible();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});

		it('says a teammate confirmed when the player did not', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ a: true }),
				...handlers()
			});
			await expect
				.element(screen.getByText(/A player on your team confirmed this score/))
				.toBeVisible();
			await expect.element(screen.getByText(/You confirmed/)).not.toBeInTheDocument();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});
	});

	describe('a pending match with both teams confirmed', () => {
		it('does not say it waits for the other team', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ a: true, b: true, decision: 'confirm' }),
				...handlers()
			});
			await expect
				.element(screen.getByRole('heading', { name: 'Waiting for confirmation' }))
				.toBeVisible();
			await expect.element(screen.getByText(/other team/)).not.toBeInTheDocument();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});
	});

	describe('a pending match the player is not in', () => {
		it('says it waits for confirmation, with no buttons', async () => {
			const screen = await render(StatusPanel, { match: sampleMatch(), ...handlers() });
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
		it(`explains a ${status} match, with no buttons`, async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({}, { status }),
				...handlers()
			});
			await expect.element(screen.getByRole('heading', { name: title })).toBeVisible();
			await expect.element(screen.getByText(text)).toBeVisible();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});
	}

	it('says a confirmed match is confirmed when neither team shows a confirmation', async () => {
		// An organizer can confirm a match, so both teams read false. Status decides.
		const screen = await render(StatusPanel, {
			match: viewerMatch({ a: false, b: false }, { status: 'confirmed' }),
			...handlers()
		});
		await expect.element(screen.getByRole('heading', { name: 'Confirmed' })).toBeVisible();
		await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
	});

	it('shows the player their own decision on a confirmed or disputed match', async () => {
		const confirmed = await render(StatusPanel, {
			match: viewerMatch({ a: true, b: true, decision: 'confirm' }, { status: 'confirmed' }),
			...handlers()
		});
		await expect.element(confirmed.getByText(/You confirmed this score/)).toBeVisible();
		const disputed = await render(StatusPanel, {
			match: viewerMatch({ decision: 'dispute' }, { status: 'disputed' }),
			...handlers()
		});
		await expect.element(disputed.getByText(/You said this score is wrong/)).toBeVisible();
	});

	describe('a player who withdrew their dispute', () => {
		it('says so while another player keeps the match disputed', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ decision: 'withdraw' }, { status: 'disputed' }),
				...handlers()
			});
			await expect.element(screen.getByRole('heading', { name: 'Disputed' })).toBeVisible();
			await expect
				.element(screen.getByText(/You withdrew your dispute\. Another player in this match/))
				.toBeVisible();
			await expect
				.element(screen.getByText(/You said this score is wrong/))
				.not.toBeInTheDocument();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});

		it('reads a confirmed match as confirmed, not as their confirmation or dispute', async () => {
			// They confirmed, disputed, then withdrew: the confirmation still shows for their team.
			const screen = await render(StatusPanel, {
				match: viewerMatch({ a: true, b: true, decision: 'withdraw' }, { status: 'confirmed' }),
				...handlers()
			});
			await expect.element(screen.getByText(/This score is confirmed/)).toBeVisible();
			await expect.element(screen.getByText(/You confirmed/)).not.toBeInTheDocument();
			await expect.element(screen.getByText(/wrong/)).not.toBeInTheDocument();
		});

		it('reads a pending match from the teams, not from the withdrawn dispute', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ a: true, decision: 'withdraw' }),
				...handlers()
			});
			await expect
				.element(screen.getByRole('heading', { name: 'Waiting for the other team' }))
				.toBeVisible();
			await expect
				.element(screen.getByText(/A player on your team confirmed this score/))
				.toBeVisible();
			await expect.element(screen.getByText(/wrong/)).not.toBeInTheDocument();
		});
	});

	it('uses no em dashes in any of its copy', async () => {
		for (const status of ['pending', 'confirmed', 'disputed', 'voided'] as const) {
			for (const match of [
				sampleMatch({ status }),
				viewerMatch({}, { status }),
				viewerMatch({ a: true, decision: 'confirm' }, { status }),
				viewerMatch({ decision: 'withdraw' }, { status })
			]) {
				const screen = await render(StatusPanel, { match, ...handlers() });
				expect(screen.container.textContent).not.toContain('—');
			}
		}
	});
});
