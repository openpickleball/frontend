import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { AppError } from '#lib/api/index.js';
import { parseMatchCode, parsePlayerCode, type Match, type PlayerCode } from '#lib/domain/index.js';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import type { SubmitResult } from '../service.js';
import RecordForm from './record-form.svelte';

function code(key: string): PlayerCode {
	const parsed = parsePlayerCode(PLAYERS.find((p) => p.key === key)!.code);
	if (!parsed.ok) throw new Error('bad fixture code');
	return parsed.value;
}
const tamsin = code('tamsin');

function appError(overrides: Partial<AppError>): AppError {
	return {
		kind: 'validation',
		status: 422,
		code: 'validation_error',
		message: 'The request is not valid.',
		fields: {},
		...overrides
	};
}

const matchCode = (() => {
	const parsed = parseMatchCode('M-9QF6-RD2K-X3BP');
	return parsed.ok ? parsed.value : null;
})();

/** A saved match for the stand-in service to answer with. Only its code matters to the form. */
const saved = { code: matchCode } as unknown as Match;
const recordedResult: SubmitResult = { match: saved, confirmError: null };

type Screen = Awaited<ReturnType<typeof render>>;

async function setup(submit = vi.fn().mockResolvedValue(recordedResult)) {
	const onrecorded = vi.fn();
	const screen = await render(RecordForm, { own: tamsin, onrecorded, submit });
	return { screen, submit, onrecorded };
}

async function addPlayer(screen: Screen, label: string, value: string) {
	await screen.getByLabelText(label).fill(value);
	await screen.getByLabelText(label).element().blur();
}

/** A full doubles match: partner, two opponents, and one game of 11 to 7. */
async function fillDoubles(screen: Screen) {
	await addPlayer(screen, 'Your partner: name or OPEN code', code('oren'));
	await addPlayer(screen, 'First opponent: name or OPEN code', code('kit'));
	await addPlayer(screen, 'Second opponent: name or OPEN code', code('bea'));
	await screen.getByLabelText("Game 1, your team's points").fill('11');
	await screen.getByLabelText("Game 1, opponents' points").fill('7');
}

describe('RecordForm', () => {
	it('locks the player own code on team A and shows only codes on chips', async () => {
		const { screen } = await setup();
		await expect.element(screen.getByTestId('chip')).toHaveTextContent(tamsin);
		await expect
			.poll(() => screen.getByRole('group', { name: 'Your team' }).element().textContent)
			.toContain('Your team You');
		// Nothing to remove for the player's own code.
		await expect
			.element(screen.getByRole('button', { name: `Remove ${tamsin}` }))
			.not.toBeInTheDocument();
	});

	it('hides the partner and the second opponent in singles, and brings them back', async () => {
		const { screen } = await setup();
		await expect.element(screen.getByLabelText('Your partner: name or OPEN code')).toBeVisible();
		await expect.element(screen.getByLabelText('Second opponent: name or OPEN code')).toBeVisible();

		await screen.getByText('Singles', { exact: true }).click();
		await expect
			.element(screen.getByLabelText('Your partner: name or OPEN code'))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByLabelText('Second opponent: name or OPEN code'))
			.not.toBeInTheDocument();
		await expect.element(screen.getByLabelText('Your opponent: name or OPEN code')).toBeVisible();

		await screen.getByText('Doubles', { exact: true }).click();
		await expect.element(screen.getByLabelText('Your partner: name or OPEN code')).toBeVisible();
	});

	it('adds and removes games, from 1 up to 5', async () => {
		const { screen } = await setup();
		await expect.element(screen.getByText('Game 1', { exact: true })).toBeVisible();
		// A single game has nothing to remove.
		await expect
			.element(screen.getByRole('button', { name: 'Remove game 1' }))
			.not.toBeInTheDocument();

		for (let n = 2; n <= 5; n++) {
			await screen.getByRole('button', { name: 'Add a game' }).click();
			await expect.element(screen.getByText(`Game ${n}`, { exact: true })).toBeVisible();
		}
		await expect
			.element(screen.getByRole('button', { name: 'Add a game' }))
			.not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Remove game 5' }).click();
		await expect.element(screen.getByText('Game 5', { exact: true })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Add a game' })).toBeVisible();
	});

	it('turns a typed code into a chip in its canonical form, and takes it back off', async () => {
		const { screen } = await setup();
		const typed = code('oren').toLowerCase().replaceAll('-', ' ');
		await addPlayer(screen, 'Your partner: name or OPEN code', typed);

		await expect
			.element(screen.getByRole('button', { name: `Remove ${code('oren')}` }))
			.toBeVisible();
		await expect
			.element(screen.getByLabelText('Your partner: name or OPEN code'))
			.not.toBeInTheDocument();

		await screen.getByRole('button', { name: `Remove ${code('oren')}` }).click();
		await expect.element(screen.getByLabelText('Your partner: name or OPEN code')).toBeVisible();
	});

	it('says what is wrong with a code that does not check out', async () => {
		const { screen } = await setup();
		await addPlayer(screen, 'Your partner: name or OPEN code', 'P-AAAA-AAAA');
		const field = screen.getByLabelText('Your partner: name or OPEN code');
		await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		await expect.element(screen.getByText(/does not look right/)).toBeVisible();
	});

	it('refuses the same player twice', async () => {
		const { screen } = await setup();
		await addPlayer(screen, 'Your partner: name or OPEN code', tamsin);
		await expect.element(screen.getByText('This player is already in the match.')).toBeVisible();
	});

	it('shows an error summary on submit whose links move focus to each field', async () => {
		const { screen, submit } = await setup();
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		const summary = screen.getByRole('alert');
		await expect
			.poll(() => summary.element().textContent)
			.toMatch(/Fix 4 things to record this match/);
		await vi.waitFor(() => expect(document.activeElement?.id).toBe('error-summary'));
		expect(submit).not.toHaveBeenCalled();

		await screen.getByRole('link', { name: "Add your partner's OPEN code." }).click();
		await vi.waitFor(() => expect(document.activeElement?.id).toBe('partner'));

		await screen.getByRole('link', { name: /Game 1: enter both scores/ }).click();
		await vi.waitFor(() => expect(document.activeElement?.id).toBe('game-0-a'));
	});

	it('shows a score error under its game when the player leaves it', async () => {
		const { screen } = await setup();
		await screen.getByLabelText("Game 1, your team's points").fill('11');
		await screen.getByLabelText("Game 1, opponents' points").fill('10');
		await screen.getByLabelText("Game 1, opponents' points").element().blur();

		await expect
			.element(screen.getByText('Game 1: the winner must win by 2 points.'))
			.toBeVisible();
		await expect
			.element(screen.getByLabelText("Game 1, your team's points"))
			.toHaveAttribute('aria-invalid', 'true');
	});

	it('sends a valid doubles match and hands the result on', async () => {
		const { screen, submit, onrecorded } = await setup();
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		await vi.waitFor(() => expect(onrecorded).toHaveBeenCalledWith(recordedResult));
		expect(submit).toHaveBeenCalledOnce();
		const [draft, own] = submit.mock.calls[0];
		expect(own).toBe(tamsin);
		expect(draft).toMatchObject({
			format: 'doubles',
			teamA: [tamsin, code('oren')],
			teamB: [code('kit'), code('bea')],
			games: [{ teamA: 11, teamB: 7 }],
			gameTarget: 11,
			scoringType: 'side_out'
		});
	});

	it('says the button confirms the score for the player team', async () => {
		const { screen } = await setup();
		await expect
			.element(screen.getByRole('button', { name: 'Record and confirm score' }))
			.toBeVisible();
		await expect.element(screen.getByText(/confirms the score for your team/)).toBeVisible();
	});

	it('puts server errors on the same fields, grouping game errors under the game', async () => {
		const submit = vi.fn().mockRejectedValue(
			appError({
				fields: {
					'team_b.0': ['No player has this OPEN Code.'],
					'games.0.team_a': ['Input should be a valid integer']
				}
			})
		);
		const { screen, onrecorded } = await setup(submit);
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		await expect.element(screen.getByText('No player has this OPEN Code.').first()).toBeVisible();
		await expect.element(screen.getByText('Input should be a valid integer').first()).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: `Remove ${code('kit')}` }))
			.toHaveAttribute('aria-describedby', 'opponent-0-error');
		await expect
			.element(screen.getByLabelText("Game 1, your team's points"))
			.toHaveAttribute('aria-invalid', 'true');
		expect(onrecorded).not.toHaveBeenCalled();
	});

	it('shows the offline message, keeps the form filled and queues nothing', async () => {
		const submit = vi
			.fn()
			.mockRejectedValue(appError({ kind: 'network', status: null, code: 'network_error' }));
		const { screen, onrecorded } = await setup(submit);
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		await expect
			.element(screen.getByText('We lost the connection. Your match may not have been saved.'))
			.toBeVisible();
		await expect.element(screen.getByText(/Check your matches before you try again/)).toBeVisible();
		await expect.element(screen.getByLabelText("Game 1, your team's points")).toHaveValue('11');
		await expect
			.element(screen.getByRole('button', { name: `Remove ${code('oren')}` }))
			.toBeVisible();
		expect(onrecorded).not.toHaveBeenCalled();

		// Trying again after reconnecting sends the same match.
		submit.mockResolvedValue(recordedResult);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();
		await vi.waitFor(() => expect(onrecorded).toHaveBeenCalledOnce());
	});

	it('links a duplicate to the earlier match', async () => {
		const submit = vi.fn().mockRejectedValue(
			appError({
				kind: 'duplicate',
				status: 409,
				code: 'duplicate_match',
				message: `This match was already submitted as ${matchCode}.`
			})
		);
		const { screen } = await setup(submit);
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		await expect.element(screen.getByText('This match was already recorded')).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'See the match' }))
			.toHaveAttribute('href', expect.stringContaining(`/matches/${matchCode}`));
		await expect.element(screen.getByText('You may still need to confirm it.')).toBeVisible();
	});

	it('keeps a server error on its own field until that field changes', async () => {
		const submit = vi.fn().mockRejectedValue(
			appError({
				fields: { 'team_b.1': ['No player has this OPEN Code.'] }
			})
		);
		const { screen } = await setup(submit);
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();
		await expect.element(screen.getByText('No player has this OPEN Code.').first()).toBeVisible();

		// An unrelated edit leaves it.
		await screen.getByLabelText('Date played').fill('2026-01-02');
		await expect.element(screen.getByText('No player has this OPEN Code.').first()).toBeVisible();
		await screen.getByLabelText("Game 1, opponents' points").fill('6');
		await expect.element(screen.getByText('No player has this OPEN Code.').first()).toBeVisible();

		// Editing that opponent clears it.
		await screen.getByRole('button', { name: `Remove ${code('bea')}` }).click();
		await expect.element(screen.getByText('No player has this OPEN Code.')).not.toBeInTheDocument();
	});

	it('offers to change the saved code when the backend refuses the submitter', async () => {
		const submit = vi.fn().mockRejectedValue(
			appError({
				kind: 'forbidden',
				status: 403,
				code: 'forbidden',
				message: 'You are not allowed to submit this match.'
			})
		);
		const onchangecode = vi.fn();
		const onrecorded = vi.fn();
		const screen = await render(RecordForm, { own: tamsin, onrecorded, onchangecode, submit });
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		await expect.element(screen.getByText(/saved on this device may not be yours/)).toBeVisible();
		await screen.getByRole('button', { name: 'Change my code' }).click();
		expect(onchangecode).toHaveBeenCalledOnce();
	});

	it('does not offer a code change for a CSRF refusal', async () => {
		const submit = vi
			.fn()
			.mockRejectedValue(
				appError({ kind: 'csrf', status: 403, code: 'forbidden', message: 'Please reload.' })
			);
		const screen = await render(RecordForm, {
			own: tamsin,
			onrecorded: vi.fn(),
			onchangecode: vi.fn(),
			submit
		});
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();
		await expect.element(screen.getByText('We could not record this match')).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'Change my code' }))
			.not.toBeInTheDocument();
	});

	it('says to enter both scores when one is blank', async () => {
		const { screen } = await setup();
		await addPlayer(screen, 'Your partner: name or OPEN code', code('oren'));
		await addPlayer(screen, 'First opponent: name or OPEN code', code('kit'));
		await addPlayer(screen, 'Second opponent: name or OPEN code', code('bea'));
		await screen.getByLabelText("Game 1, your team's points").fill('11');
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();
		await expect.element(screen.getByText('Game 1: enter both scores.').first()).toBeVisible();

		await screen.getByLabelText("Game 1, opponents' points").fill('x');
		await expect
			.element(screen.getByText('Game 1: enter each score as a whole number.').first())
			.toBeVisible();
	});

	it('refuses a date after the local today', async () => {
		const { screen, submit } = await setup();
		await fillDoubles(screen);
		await screen.getByLabelText('Date played').fill('2999-01-01');
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();
		await expect
			.element(screen.getByText('The date played cannot be in the future.').first())
			.toBeVisible();
		expect(submit).not.toHaveBeenCalled();
	});

	it('does not count a hidden partner when checking for repeats in singles', async () => {
		const { screen } = await setup();
		await addPlayer(screen, 'Your partner: name or OPEN code', code('oren'));
		await screen.getByText('Singles', { exact: true }).click();
		await addPlayer(screen, 'Your opponent: name or OPEN code', code('oren'));
		await expect
			.element(screen.getByRole('button', { name: `Remove ${code('oren')}` }))
			.toBeVisible();
		await expect
			.element(screen.getByText('This player is already in the match.'))
			.not.toBeInTheDocument();
	});

	it('keeps focus in the games when a game is added or removed', async () => {
		const { screen } = await setup();
		const add = () => screen.getByRole('button', { name: 'Add a game' });
		await add().click();
		await expect.element(screen.getByLabelText("Game 2, your team's points")).toHaveFocus();
		await add().click();
		await expect.element(screen.getByLabelText("Game 3, your team's points")).toHaveFocus();

		// Removing a middle game focuses the game now in its place.
		await screen.getByRole('button', { name: 'Remove game 2' }).click();
		await expect.element(screen.getByLabelText("Game 2, your team's points")).toHaveFocus();
		// Removing the last game focuses the one before.
		await screen.getByRole('button', { name: 'Remove game 2' }).click();
		await expect.element(screen.getByLabelText("Game 1, your team's points")).toHaveFocus();
	});

	it('focuses the next game after removing the first', async () => {
		const { screen } = await setup();
		await screen.getByRole('button', { name: 'Add a game' }).click();
		await screen.getByRole('button', { name: 'Remove game 1' }).click();
		// Game 2 became game 1, so focus follows it.
		await expect.element(screen.getByLabelText("Game 1, your team's points")).toHaveFocus();
	});
});

describe('RecordForm player search', () => {
	it('fills a slot from a search result and sends that code', async () => {
		const search = vi.fn().mockResolvedValue({
			ok: true,
			items: [{ code: code('oren'), name: 'Oren Quill' }]
		});
		const submit = vi.fn().mockResolvedValue(recordedResult);
		const screen = await render(RecordForm, { own: tamsin, onrecorded: vi.fn(), submit, search });
		await screen.getByLabelText('Your partner: name or OPEN code').fill('ore');
		await screen.getByRole('option', { name: /Oren Quill/ }).click();

		await expect
			.element(screen.getByRole('button', { name: `Remove ${code('oren')}` }))
			.toBeVisible();
		await expect.element(screen.getByText('Oren Quill')).toBeVisible();

		await addPlayer(screen, 'First opponent: name or OPEN code', code('kit'));
		await addPlayer(screen, 'Second opponent: name or OPEN code', code('bea'));
		await screen.getByLabelText("Game 1, your team's points").fill('11');
		await screen.getByLabelText("Game 1, opponents' points").fill('7');
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();
		await vi.waitFor(() => expect(submit).toHaveBeenCalled());
		expect(submit.mock.calls[0][0].teamA).toEqual([tamsin, code('oren')]);
	});
});

describe('RecordForm half-typed name', () => {
	it('asks to pick a player when a name is left in the box', async () => {
		const search = vi.fn().mockResolvedValue({ ok: true, items: [] });
		const screen = await render(RecordForm, {
			own: tamsin,
			onrecorded: vi.fn(),
			submit: vi.fn(),
			search
		});
		const field = screen.getByLabelText('Your partner: name or OPEN code');
		await field.fill('mar');
		await field.element().blur();
		await expect
			.element(screen.getByText('Pick a player from the list, or enter their OPEN code.'))
			.toBeVisible();
	});
});
