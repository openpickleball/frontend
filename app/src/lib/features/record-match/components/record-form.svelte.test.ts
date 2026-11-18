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
	await addPlayer(screen, "Your partner's OPEN code", code('oren'));
	await addPlayer(screen, "First opponent's OPEN code", code('kit'));
	await addPlayer(screen, "Second opponent's OPEN code", code('bea'));
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
		await expect.element(screen.getByLabelText("Your partner's OPEN code")).toBeVisible();
		await expect.element(screen.getByLabelText("Second opponent's OPEN code")).toBeVisible();

		await screen.getByText('Singles', { exact: true }).click();
		await expect.element(screen.getByLabelText("Your partner's OPEN code")).not.toBeInTheDocument();
		await expect
			.element(screen.getByLabelText("Second opponent's OPEN code"))
			.not.toBeInTheDocument();
		await expect.element(screen.getByLabelText("Your opponent's OPEN code")).toBeVisible();

		await screen.getByText('Doubles', { exact: true }).click();
		await expect.element(screen.getByLabelText("Your partner's OPEN code")).toBeVisible();
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
		await addPlayer(screen, "Your partner's OPEN code", typed);

		await expect
			.element(screen.getByRole('button', { name: `Remove ${code('oren')}` }))
			.toBeVisible();
		await expect.element(screen.getByLabelText("Your partner's OPEN code")).not.toBeInTheDocument();

		await screen.getByRole('button', { name: `Remove ${code('oren')}` }).click();
		await expect.element(screen.getByLabelText("Your partner's OPEN code")).toBeVisible();
	});

	it('says what is wrong with a code that does not check out', async () => {
		const { screen } = await setup();
		await addPlayer(screen, "Your partner's OPEN code", 'P-AAAA-AAAA');
		const field = screen.getByLabelText("Your partner's OPEN code");
		await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		await expect.element(screen.getByText(/does not look right/)).toBeVisible();
	});

	it('refuses the same player twice', async () => {
		const { screen } = await setup();
		await addPlayer(screen, "Your partner's OPEN code", tamsin);
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

		await screen.getByRole('link', { name: /Game 1: enter each score/ }).click();
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
			.element(screen.getByText("You're offline. Your match was not saved."))
			.toBeVisible();
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
	});
});
