import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import {
	DISPUTE_ENDS,
	DISPUTE_ENDS_EVENT,
	HOLD_COUNTS,
	VOUCH_MEANS,
	VOUCH_MEANS_ORGANIZER
} from '../status.js';
import { sampleMatch, viewerMatch } from '../testing.js';
import StatusPanel from './status-panel.svelte';

const handlers = () => ({ onconfirm: vi.fn(), ondispute: vi.fn() });

type Screen = Awaited<ReturnType<typeof render>>;

/** The panel's action buttons, in order. The info button by the title is not one. */
const actions = (screen: Screen) =>
	screen
		.getByRole('button')
		.elements()
		.filter((button) => !button.matches('[data-slot="info-button"]'))
		.map((button) => button.textContent?.trim());

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
				.element(screen.getByText(/counts once a player on each team confirms this score/))
				.toBeVisible();
		});

		it('says the other team has confirmed', async () => {
			const screen = await render(StatusPanel, { match: viewerMatch({ b: true }), ...handlers() });
			await expect
				.element(screen.getByText(/The other team confirmed this score, and the match counts/))
				.toBeVisible();
		});

		it('reads the other team from the side the player is on', async () => {
			const match = viewerMatch({ a: true, b: false }, { viewerSide: 'b' });
			const screen = await render(StatusPanel, { match, ...handlers() });
			await expect.element(screen.getByText(/The other team confirmed/)).toBeVisible();
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
			expect(actions(screen)).toEqual([]);
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
			expect(actions(screen)).toEqual([]);
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
			expect(actions(screen)).toEqual([]);
		});
	});

	describe('a pending match the player is not in', () => {
		it('says it waits for confirmation, with no buttons', async () => {
			const screen = await render(StatusPanel, { match: sampleMatch(), ...handlers() });
			await expect
				.element(screen.getByRole('heading', { name: 'Waiting for confirmation' }))
				.toBeVisible();
			expect(actions(screen)).toEqual([]);
		});
	});

	for (const [status, title, text] of [
		['confirmed', 'Confirmed', /This score is confirmed, and it counts in your match history/],
		['disputed', 'Disputed', /A player in this match said the score is wrong/],
		['voided', 'Voided', /This match was voided/]
	] as const) {
		it(`explains a ${status} match, with no buttons`, async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({}, { status }),
				...handlers()
			});
			await expect.element(screen.getByRole('heading', { name: title })).toBeVisible();
			await expect.element(screen.getByText(text)).toBeVisible();
			expect(actions(screen)).toEqual([]);
		});
	}

	it('says a confirmed match is confirmed when neither team shows a confirmation', async () => {
		// An organizer can confirm a match, so both teams read false. Status decides.
		const screen = await render(StatusPanel, {
			match: viewerMatch({ a: false, b: false }, { status: 'confirmed' }),
			...handlers()
		});
		await expect.element(screen.getByRole('heading', { name: 'Confirmed' })).toBeVisible();
		expect(actions(screen)).toEqual([]);
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

		it('says the player disputed it and offers Withdraw my dispute', async () => {
			const onwithdraw = vi.fn();
			const screen = await render(StatusPanel, {
				match: disputed(),
				...handlers(),
				onwithdraw
			});
			await expect.element(screen.getByRole('heading', { name: 'Disputed' })).toBeVisible();
			await expect
				.element(
					screen.getByText("You said this score is wrong, so the match doesn't count for now.")
				)
				.toBeVisible();
			// How a dispute ends goes in an info popover (frontend#285).
			await expect
				.element(screen.getByText(/every player who disputed the score withdraws/))
				.not.toBeInTheDocument();
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
				.element(screen.getByText(/You withdrew your dispute, but another player still says/))
				.toBeVisible();
			await expect
				.element(screen.getByText(/You said this score is wrong/))
				.not.toBeInTheDocument();
			expect(actions(screen)).toEqual([]);
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

		it('says it is on hold in one sentence, and offers This match really happened', async () => {
			const onvouch = vi.fn();
			const screen = await render(StatusPanel, {
				match: confirmed(),
				hold: { vouched: false },
				...handlers(),
				onvouch
			});
			await expect.element(screen.getByRole('heading', { name: 'On hold' })).toBeVisible();
			await expect
				.element(screen.getByText(/Another match has the same teams and date/))
				.toBeVisible();
			// Why and how a hold ends go in an info popover (frontend#285). The dialog says a vouch can't be undone.
			await expect
				.element(screen.getByText(/the newer of the two matches is voided/))
				.not.toBeInTheDocument();
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
			await expect.element(screen.getByText(/Your team vouched for this match/)).toBeVisible();
			expect(actions(screen)).toEqual([]);
		});

		it('keeps Confirm first on a pending match the player has to confirm', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch(),
				hold: { vouched: false },
				...handlers()
			});
			expect(actions(screen)).toEqual(['Confirm score', 'Dispute', 'This match really happened']);
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
			expect(actions(screen)).toEqual([]);
		});
	});

	describe('the edge', () => {
		it('carries the meaning: neutral to act, danger when disputed, warning on hold', async () => {
			for (const [match, hold, tone, edge] of [
				[viewerMatch(), undefined, 'action', 'border-l-secondary'],
				[viewerMatch({}, { status: 'disputed' }), undefined, 'disputed', 'border-l-disputed'],
				[viewerMatch({}, { status: 'confirmed' }), { vouched: false }, 'held', 'border-l-warning'],
				[viewerMatch({ a: true, decision: 'confirm' }), undefined, 'plain', 'border-l-line']
			] as const) {
				const screen = await render(StatusPanel, { match, hold, ...handlers() });
				const panel = screen.getByTestId('status-panel');
				await expect.element(panel).toHaveAttribute('data-tone', tone);
				await expect.element(panel).toHaveClass(edge);
				screen.unmount();
			}
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
			const buttons = [...screen.container.querySelectorAll('a, button')].map((el) => el.id);
			expect(buttons).toEqual(['confirm-button', 'dispute-button', 'correct-button']);
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
				.element(screen.getByText(/You just corrected this match, so it has a new code/))
				.toBeVisible();
		});

		it('links a voided match to the correction that replaced it', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({}, { status: 'voided' }),
				replacedByHref: '/matches/M-FXD0-0000-0001',
				...handlers()
			});
			await expect.element(screen.getByRole('heading', { name: 'Voided' })).toBeVisible();
			await expect
				.element(screen.getByRole('link', { name: 'See the corrected match' }))
				.toHaveAttribute('href', '/matches/M-FXD0-0000-0001');
		});
	});

	describe('the info button by the title', () => {
		it('explains how a dispute ends, on a disputed match', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({ decision: 'dispute' }, { status: 'disputed' }),
				...handlers()
			});
			await screen.getByRole('button', { name: 'What does disputed mean?' }).click();
			const popover = page.getByRole('dialog', { name: 'What does disputed mean?' });
			await expect.element(popover.getByText(DISPUTE_ENDS)).toBeVisible();
		});

		it("names the event's organizer in the dispute text only on an event match", async () => {
			const event = { code: 'E-TEST-0001', name: 'Test Winter League', organizer: 'O-TEST-0001' };
			const club = { code: 'C-TEST-0001', name: 'Test Court Club' };
			for (const [where, text] of [
				[{ event, club }, DISPUTE_ENDS_EVENT],
				[{ club }, DISPUTE_ENDS]
			] as const) {
				const screen = await render(StatusPanel, {
					match: viewerMatch({}, { status: 'disputed', ...where }),
					...handlers()
				});
				await screen.getByRole('button', { name: 'What does disputed mean?' }).click();
				const popover = page.getByRole('dialog', { name: 'What does disputed mean?' });
				await expect.element(popover.getByText(text)).toBeVisible();
				expect(popover.element().textContent?.includes('organizer')).toBe(
					text === DISPUTE_ENDS_EVENT
				);
				screen.unmount();
			}
		});

		it('explains on hold and vouch while the panel asks for a vouch', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({}, { status: 'confirmed' }),
				hold: { vouched: false },
				...handlers()
			});
			await screen.getByRole('button', { name: 'What do on hold and vouch mean?' }).click();
			const popover = page.getByRole('dialog', { name: 'What do on hold and vouch mean?' });
			await expect.element(popover.getByText(HOLD_COUNTS)).toBeVisible();
			await expect.element(popover.getByText(VOUCH_MEANS)).toBeVisible();
		});

		it('words the vouch for a member of the organizer', async () => {
			const screen = await render(StatusPanel, {
				match: sampleMatch({ status: 'confirmed' }),
				hold: { vouched: false },
				...handlers()
			});
			await screen.getByRole('button', { name: 'What do on hold and vouch mean?' }).click();
			await expect.element(page.getByText(VOUCH_MEANS_ORGANIZER)).toBeVisible();
		});

		it('explains only on hold once the team has vouched', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({}, { status: 'confirmed' }),
				hold: { vouched: true },
				...handlers()
			});
			await expect
				.element(screen.getByRole('button', { name: 'What does on hold mean?' }))
				.toBeVisible();
		});

		it('explains both on a disputed match on hold', async () => {
			const screen = await render(StatusPanel, {
				match: viewerMatch({}, { status: 'disputed' }),
				hold: { vouched: false },
				...handlers()
			});
			await expect
				.element(screen.getByRole('button', { name: 'What do disputed, on hold and vouch mean?' }))
				.toBeVisible();
		});

		it('is left out where nothing needs explaining', async () => {
			for (const match of [
				viewerMatch(),
				viewerMatch({ a: true, decision: 'confirm' }),
				viewerMatch({}, { status: 'confirmed' }),
				viewerMatch({}, { status: 'voided' })
			]) {
				const screen = await render(StatusPanel, { match, ...handlers() });
				await expect.element(screen.getByTestId('status-panel')).toBeVisible();
				expect(screen.container.querySelector('[data-slot="info-button"]')).toBeNull();
				screen.unmount();
			}
		});
	});
});
