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
			await expect
				.element(screen.getByRole('heading', { name: 'Waiting for the other team' }))
				.not.toBeInTheDocument();
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

	describe('a disputed match the player disputed', () => {
		const disputed = () => viewerMatch({ decision: 'dispute' }, { status: 'disputed' });

		it('says how the dispute ends and offers Withdraw my dispute', async () => {
			const onwithdraw = vi.fn();
			const screen = await render(StatusPanel, {
				match: disputed(),
				...handlers(),
				onwithdraw
			});
			await expect.element(screen.getByRole('heading', { name: 'Disputed' })).toBeVisible();
			await expect
				.element(screen.getByText(/every player who disputed the score withdraws/))
				.toBeVisible();
			await expect.element(screen.getByText(/the match is voided/)).toBeVisible();
			await expect
				.element(screen.getByRole('button', { name: 'Confirm score' }))
				.not.toBeInTheDocument();
			await expect
				.element(screen.getByRole('button', { name: 'Dispute', exact: true }))
				.not.toBeInTheDocument();
			await screen.getByRole('button', { name: 'Withdraw my dispute' }).click();
			expect(onwithdraw).toHaveBeenCalledOnce();
		});

		it('waits while the withdraw is in flight', async () => {
			const onwithdraw = vi.fn();
			const screen = await render(StatusPanel, {
				match: disputed(),
				busy: 'withdraw',
				...handlers(),
				onwithdraw
			});
			const button = screen.getByRole('button', { name: 'Withdrawing…' });
			await expect.element(button).toHaveAttribute('aria-busy', 'true');
			await expect.element(button).toHaveAttribute('aria-disabled', 'true');
			// A DOM click, as Enter or Space on the focused button sends it.
			(button.element() as HTMLButtonElement).click();
			expect(onwithdraw).not.toHaveBeenCalled();
		});
	});

	describe('a player who withdrew their dispute', () => {
		it('offers Confirm but not Dispute once the match is pending again', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ decision: 'withdraw' }),
				...handlers()
			});
			await expect
				.element(screen.getByRole('heading', { name: 'Is this the right score?' }))
				.toBeVisible();
			await expect
				.element(screen.getByText(/You withdrew your dispute, so you can't dispute this match/))
				.toBeVisible();
			await expect.element(screen.getByRole('button', { name: 'Confirm score' })).toBeVisible();
			await expect
				.element(screen.getByRole('button', { name: 'Dispute', exact: true }))
				.not.toBeInTheDocument();
		});

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
			await expect.element(screen.getByText(/dispute it/)).not.toBeInTheDocument();
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
			await expect.element(screen.getByText(/dispute it/)).not.toBeInTheDocument();
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
	describe('a held match', () => {
		const confirmed = () =>
			viewerMatch({ a: true, b: true, decision: 'confirm' }, { status: 'confirmed' });

		it('says it is on hold and why, and offers This match really happened', async () => {
			const onvouch = vi.fn();
			const screen = await render(StatusPanel, {
				match: confirmed(),
				hold: { vouched: false },
				...handlers(),
				onvouch
			});
			await expect.element(screen.getByRole('heading', { name: 'On hold' })).toBeVisible();
			await expect
				.element(screen.getByText(/Another match on OPEN has the same teams and date/))
				.toBeVisible();
			await expect.element(screen.getByText(/You can't undo a vouch/)).toBeVisible();
			await expect
				.element(screen.getByText(/the newer of the two matches is voided/))
				.toBeVisible();
			await expect
				.element(screen.getByText(/It counts in your match history/))
				.not.toBeInTheDocument();
			await expect.element(screen.getByTestId('status-panel')).toHaveAttribute('data-held', 'true');
			await screen.getByRole('button', { name: 'This match really happened' }).click();
			expect(onvouch).toHaveBeenCalledOnce();
		});

		it('says the team vouched and offers nothing once it has', async () => {
			const screen = await render(StatusPanel, {
				match: confirmed(),
				hold: { vouched: true },
				...handlers()
			});
			await expect.element(screen.getByText(/Your team has vouched for this match/)).toBeVisible();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});

		it('keeps Confirm first on a pending match the player has to confirm', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch(),
				hold: { vouched: false },
				...handlers()
			});
			const buttons = screen.getByRole('button').elements();
			expect(buttons.map((button) => button.textContent?.trim())).toEqual([
				'Confirm score',
				'Dispute',
				'This match really happened'
			]);
		});

		it('waits while the vouch is in flight', async () => {
			const onvouch = vi.fn();
			const screen = await render(StatusPanel, {
				match: confirmed(),
				hold: { vouched: false },
				busy: 'vouch',
				...handlers(),
				onvouch
			});
			const button = screen.getByRole('button', { name: 'Vouching…' });
			await expect.element(button).toHaveAttribute('aria-busy', 'true');
			await expect.element(button).toHaveAttribute('aria-disabled', 'true');
			(button.element() as HTMLButtonElement).click();
			expect(onvouch).not.toHaveBeenCalled();
		});

		it('says nothing of a hold on a voided match', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({}, { status: 'voided' }),
				hold: { vouched: false },
				...handlers()
			});
			await expect.element(screen.getByRole('heading', { name: 'Voided' })).toBeVisible();
			await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
		});
	});

	describe('correcting the score', () => {
		const href = '/matches/M-7QK2-H9WD-3NF0/correct';

		it('links to the correction page after the other buttons, on a pending match', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch(),
				correctHref: href,
				...handlers()
			});
			const link = screen.getByRole('link', { name: 'Correct the score' });
			await expect.element(link).toHaveAttribute('href', href);
			await expect.element(link).toHaveAttribute('id', 'correct-button');
			await expect.element(screen.getByText(/To fix a wrong score, correct it/)).toBeVisible();
			const buttons = [...screen.container.querySelectorAll('a, button')].map((el) => el.id);
			expect(buttons).toEqual(['confirm-button', 'dispute-button', 'correct-button']);
		});

		it('says only the organizer changes an event match, on a disputed match', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ decision: 'dispute' }, { status: 'disputed' }),
				correctHref: href,
				...handlers()
			});
			await expect.element(screen.getByRole('link', { name: 'Correct the score' })).toBeVisible();
			await expect
				.element(screen.getByText(/Only the organizer can change a match an organizer recorded/))
				.toBeVisible();
		});

		it('offers no correction on a confirmed match', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ a: true, b: true }, { status: 'confirmed' }),
				correctHref: href,
				...handlers()
			});
			await expect
				.element(screen.getByRole('link', { name: 'Correct the score' }))
				.not.toBeInTheDocument();
		});

		it('stops being a link while another action is in flight', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch(),
				correctHref: href,
				busy: 'confirm',
				...handlers()
			});
			await expect
				.element(screen.getByRole('link', { name: 'Correct the score' }))
				.not.toBeInTheDocument();
			await expect
				.element(screen.getByRole('button', { name: 'Correct the score' }))
				.toHaveAttribute('aria-disabled', 'true');
		});

		it('says the player just corrected the match', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ a: true, decision: 'confirm' }),
				corrected: true,
				...handlers()
			});
			await expect
				.element(screen.getByText(/You just corrected this match\. It has a new code/))
				.toBeVisible();
		});

		it('links a voided match to the correction that replaced it', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({}, { status: 'voided' }),
				replacedByHref: '/matches/M-FXD0-0000-0001',
				...handlers()
			});
			await expect.element(screen.getByText(/If a player corrected this match/)).toBeVisible();
			await expect
				.element(screen.getByRole('link', { name: 'See the corrected match' }))
				.toHaveAttribute('href', '/matches/M-FXD0-0000-0001');
		});
	});
});
