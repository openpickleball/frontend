import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { parseMatchCode, parsePlayerCode, type Match, type PlayerCode } from '#lib/domain/index.js';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import { createDraftStore, type Draft, type DraftStore } from '../draft.js';
import type { SubmitResult } from '../service.js';
import RecordForm from './record-form.svelte';

function code(key: string): PlayerCode {
	const parsed = parsePlayerCode(PLAYERS.find((p) => p.key === key)!.code);
	if (!parsed.ok) throw new Error('bad fixture code');
	return parsed.value;
}
const tamsin = code('tamsin');

function appError(overrides: Partial<AppErrorFields>): AppError {
	return new AppError({
		kind: 'validation',
		status: 422,
		code: 'validation_error',
		message: 'The request is not valid.',
		fields: {},
		...overrides
	});
}

const matchCode = (() => {
	const parsed = parseMatchCode('M-9QF6-RD2K-X3BP');
	return parsed.ok ? parsed.value : null;
})();

/** A saved match for the stand-in service to answer with. Only its code matters to the form. */
const saved = { code: matchCode } as unknown as Match;
const recordedResult: SubmitResult = { match: saved };

// Tests that render without a stand-in store use the real one, so start each from a clean tab.
beforeEach(() => sessionStorage.clear());

type Screen = Awaited<ReturnType<typeof render>>;

/** A draft store over a map, so tests never share the browser's sessionStorage. */
function memoryDrafts(items = new Map<string, string>()): DraftStore {
	return createDraftStore(() => ({
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
		removeItem: (key) => void items.delete(key)
	}));
}

async function setup(
	submit = vi.fn().mockResolvedValue(recordedResult),
	drafts: DraftStore = memoryDrafts()
) {
	const onrecorded = vi.fn();
	const screen = await render(RecordForm, { own: tamsin, onrecorded, submit, drafts });
	return { screen, submit, onrecorded, drafts };
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

	it('steps the headings down one level at a time', async () => {
		const { screen } = await setup();
		await expect
			.element(screen.getByRole('heading', { level: 2, name: 'Your team' }))
			.toBeVisible();
		await expect
			.element(screen.getByRole('heading', { level: 2, name: 'Opponents' }))
			.toBeVisible();
		await expect.element(screen.getByRole('heading', { level: 3 })).not.toBeInTheDocument();
	});

	it('hides the partner and the second opponent in singles, and brings them back', async () => {
		const { screen } = await setup();
		await expect.element(screen.getByLabelText('Your partner: name or OPEN code')).toBeVisible();
		await expect.element(screen.getByLabelText('Second opponent: name or OPEN code')).toBeVisible();

		await screen.getByRole('radio', { name: 'Singles' }).click();
		await expect
			.element(screen.getByLabelText('Your partner: name or OPEN code'))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByLabelText('Second opponent: name or OPEN code'))
			.not.toBeInTheDocument();
		await expect.element(screen.getByLabelText('Your opponent: name or OPEN code')).toBeVisible();

		await screen.getByRole('radio', { name: 'Doubles' }).click();
		await expect.element(screen.getByLabelText('Your partner: name or OPEN code')).toBeVisible();
	});

	it('moves between the choices with the arrow keys, as radios', async () => {
		const { screen } = await setup();
		const doubles = screen.getByRole('radio', { name: 'Doubles' });
		await expect.element(doubles).toBeChecked();
		await (doubles.element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowLeft}');
		await expect.element(screen.getByRole('radio', { name: 'Singles' })).toBeChecked();
		await expect
			.element(screen.getByLabelText('Second opponent: name or OPEN code'))
			.not.toBeInTheDocument();
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(doubles).toBeChecked();
		await expect.element(screen.getByRole('group', { name: 'Format' })).toBeVisible();
	});

	it('names each section and each segmented control as a group', async () => {
		const { screen } = await setup();
		for (const name of ['Match', 'Players', 'Scoring', 'Games', 'Games to', 'Scoring']) {
			await expect.element(screen.getByRole('group', { name }).first()).toBeVisible();
		}
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

		const summary = screen.getByRole('alert').filter({ hasText: 'Fix 4 things' });
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

	it('holds a score error back until submit, so leaving the row moves nothing', async () => {
		const { screen } = await setup();
		await screen.getByLabelText("Game 1, your team's points").fill('11');
		await screen.getByLabelText("Game 1, opponents' points").fill('10');
		await screen.getByLabelText("Game 1, opponents' points").element().blur();
		expect(screen.getByText('Game 1: the winner must win by 2 points.').elements()).toHaveLength(0);
		await expect
			.element(screen.getByLabelText("Game 1, your team's points"))
			.not.toHaveAttribute('aria-invalid', 'true');

		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		await expect
			.element(screen.getByText('Game 1: the winner must win by 2 points.').last())
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

	it('announces a game error as an alert linked to its fields once submitted', async () => {
		const { screen } = await setup(vi.fn());
		const points = screen.getByLabelText("Game 1, your team's points");
		await points.fill('x');
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		const alert = screen.getByRole('alert').filter({ hasText: '! Game 1: enter both scores.' });
		await expect.element(alert).toBeVisible();
		await expect.element(points).toHaveAttribute('aria-describedby', 'game-0-error');
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

	it('asks the player to wait and keeps the form filled after too many requests', async () => {
		const submit = vi.fn().mockRejectedValue(
			appError({
				kind: 'throttled',
				status: 429,
				code: 'throttled',
				message: 'Too many attempts. Wait a moment and try again.'
			})
		);
		const { screen, onrecorded } = await setup(submit);
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		await expect.element(screen.getByText("We couldn't record this match")).toBeVisible();
		await expect
			.element(screen.getByText('Too many attempts. Wait a moment and try again.'))
			.toBeVisible();
		await expect.element(screen.getByLabelText("Game 1, your team's points")).toHaveValue('11');
		expect(onrecorded).not.toHaveBeenCalled();
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

	it('says why when the backend refuses the submitter, and keeps what was entered', async () => {
		const submit = vi.fn().mockRejectedValue(
			appError({
				kind: 'forbidden',
				status: 403,
				code: 'forbidden',
				message: 'You are not allowed to submit this match.'
			})
		);
		const onrecorded = vi.fn();
		const screen = await render(RecordForm, { own: tamsin, onrecorded, submit });
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();

		await expect
			.element(screen.getByText(/You can only record a match you played in/))
			.toBeVisible();
		await expect.element(screen.getByText('Everything you entered is still here.')).toBeVisible();
		expect(onrecorded).not.toHaveBeenCalled();
	});

	it('shows the backend message for a CSRF refusal', async () => {
		const submit = vi
			.fn()
			.mockRejectedValue(
				appError({ kind: 'csrf', status: 403, code: 'forbidden', message: 'Please reload.' })
			);
		const screen = await render(RecordForm, { own: tamsin, onrecorded: vi.fn(), submit });
		await fillDoubles(screen);
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();
		await expect.element(screen.getByText("We couldn't record this match")).toBeVisible();
		await expect
			.element(screen.getByText(/You can only record a match you played in/))
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
		await screen.getByRole('radio', { name: 'Singles' }).click();
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

		// Focus moves to the new chip, and a screen reader hears who was added.
		await expect.element(screen.getByRole('button', { name: 'Remove Oren Quill' })).toHaveFocus();
		await expect.element(screen.getByTestId('chip-name')).toHaveTextContent('Oren Quill');
		await expect
			.poll(() =>
				screen
					.getByTestId('search-status')
					.elements()
					.map((e) => e.textContent?.trim())
			)
			.toContain('Added Oren Quill.');

		await addPlayer(screen, 'First opponent: name or OPEN code', code('kit'));
		await addPlayer(screen, 'Second opponent: name or OPEN code', code('bea'));
		await screen.getByLabelText("Game 1, your team's points").fill('11');
		await screen.getByLabelText("Game 1, opponents' points").fill('7');
		await screen.getByRole('button', { name: 'Record and confirm score' }).click();
		await vi.waitFor(() => expect(submit).toHaveBeenCalled());
		expect(submit.mock.calls[0][0].teamA).toEqual([tamsin, code('oren')]);
	});
});

describe('RecordForm player search by keyboard', () => {
	it('types a name, arrows to a player, picks with Enter and tabs on', async () => {
		const search = vi.fn().mockResolvedValue({
			ok: true,
			items: [
				{ code: code('kit'), name: 'Kit Ashdown' },
				{ code: code('oren'), name: 'Oren Quill' }
			]
		});
		const screen = await render(RecordForm, {
			own: tamsin,
			onrecorded: vi.fn(),
			submit: vi.fn(),
			search
		});
		await screen.getByLabelText('Your partner: name or OPEN code').click();
		await userEvent.keyboard('kit o');
		await expect.element(screen.getByRole('option').first()).toBeVisible();
		await userEvent.keyboard('{ArrowDown}{Enter}');

		const remove = screen.getByRole('button', { name: 'Remove Oren Quill' });
		await expect.element(remove).toHaveFocus();
		await userEvent.keyboard('{Tab}');
		await expect.element(screen.getByLabelText('First opponent: name or OPEN code')).toHaveFocus();
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

describe('RecordForm draft', () => {
	it('puts back the players and scores after a reload', async () => {
		const drafts = memoryDrafts();
		const first = await setup(undefined, drafts);
		await fillDoubles(first.screen);
		await first.screen.unmount();

		const { screen } = await setup(undefined, drafts);
		for (const key of ['oren', 'kit', 'bea']) {
			await expect
				.element(screen.getByRole('button', { name: `Remove ${code(key)}` }))
				.toBeVisible();
		}
		await expect.element(screen.getByLabelText("Game 1, your team's points")).toHaveValue('11');
		await expect.element(screen.getByLabelText("Game 1, opponents' points")).toHaveValue('7');
	});

	it('does not show one player a draft kept for another', async () => {
		const drafts = memoryDrafts();
		const first = await setup(undefined, drafts);
		await fillDoubles(first.screen);
		await first.screen.unmount();

		const screen = await render(RecordForm, {
			own: code('oren'),
			onrecorded: vi.fn(),
			drafts
		});
		await expect.element(screen.getByLabelText('Your partner: name or OPEN code')).toBeVisible();
		await expect.element(screen.getByLabelText("Game 1, your team's points")).toHaveValue('');
	});

	it('drops the draft once the match is recorded', async () => {
		const drafts = memoryDrafts();
		const { screen, onrecorded } = await setup(undefined, drafts);
		await fillDoubles(screen);
		expect(drafts.read(tamsin)).not.toBeNull();

		await screen.getByRole('button', { name: /record and confirm/i }).click();
		await vi.waitFor(() => expect(onrecorded).toHaveBeenCalled());
		expect(drafts.read(tamsin)).toBeNull();
	});
});

describe('RecordForm correcting a match', () => {
	const draft: Draft = {
		format: 'doubles',
		playedOn: '2024-06-01',
		gameTarget: 11,
		scoringType: 'side_out',
		partner: { code: code('kit'), name: 'Kit Ashdown' },
		opponents: [
			{ code: code('bea'), name: 'Bea Marlowe' },
			{ code: code('oren'), name: 'Oren Quill' }
		],
		games: [
			{ a: '11', b: '9' },
			{ a: '6', b: '11' },
			{ a: '11', b: '7' }
		]
	};

	async function correcting(submit = vi.fn().mockResolvedValue(recordedResult)) {
		const onrecorded = vi.fn();
		const drafts = memoryDrafts();
		const screen = await render(RecordForm, {
			own: tamsin,
			onrecorded,
			submit,
			drafts,
			correcting: { code: matchCode!, draft }
		});
		return { screen, submit, onrecorded, drafts };
	}

	it('starts from the match, with the players and format fixed', async () => {
		const { screen } = await correcting();
		await expect.element(screen.getByTestId('fixed-format')).toHaveTextContent('Doubles');
		await expect.element(screen.getByRole('radio', { name: 'Singles' })).not.toBeInTheDocument();
		await expect.element(screen.getByText('Kit Ashdown')).toBeVisible();
		await expect.element(screen.getByText('Oren Quill')).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'Remove Kit Ashdown' }))
			.not.toBeInTheDocument();
		await expect.element(screen.getByLabelText('Date played')).toHaveValue('2024-06-01');
		await expect.element(screen.getByLabelText("Game 2, your team's points")).toHaveValue('6');
		await expect.element(screen.getByText(/A correction keeps the same players/)).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Save the correction' })).toBeVisible();
		await expect.element(screen.getByText(/with a new match code/)).toBeVisible();
	});

	it('sends the edited scores with the same players, and keeps no draft', async () => {
		const { screen, submit, onrecorded, drafts } = await correcting();
		await screen.getByLabelText("Game 2, your team's points").fill('8');
		await screen.getByRole('button', { name: 'Save the correction' }).click();
		await vi.waitFor(() => expect(onrecorded).toHaveBeenCalledWith(recordedResult));
		const [input, own] = submit.mock.calls[0];
		expect(own).toBe(tamsin);
		expect(input.teamA).toEqual([tamsin, code('kit')]);
		expect(input.teamB).toEqual([code('bea'), code('oren')]);
		expect(input.games).toEqual([
			{ teamA: 11, teamB: 9 },
			{ teamA: 8, teamB: 11 },
			{ teamA: 11, teamB: 7 }
		]);
		expect(drafts.read(tamsin)).toBeNull();
	});

	it('says only the organizer can change an event match, with a way back', async () => {
		const submit = vi
			.fn()
			.mockRejectedValue(appError({ kind: 'not_found', status: 404, code: 'not_found' }));
		const { screen } = await correcting(submit);
		await screen.getByRole('button', { name: 'Save the correction' }).click();
		await expect
			.element(screen.getByText('This match can only be changed by its organizer'))
			.toBeVisible();
		await expect
			.element(screen.getByText(/a match that players recorded themselves/))
			.toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'Back to the match' }))
			.toHaveAttribute('href', `/matches/${matchCode}`);
	});

	it('says a match that changed meanwhile can no longer be corrected', async () => {
		const submit = vi
			.fn()
			.mockRejectedValue(appError({ kind: 'conflict', status: 409, code: 'conflict' }));
		const { screen } = await correcting(submit);
		await screen.getByRole('button', { name: 'Save the correction' }).click();
		await expect.element(screen.getByText("This match can't be corrected now")).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'See where it stands' })).toBeVisible();
	});

	it('shows a 422 on its field, with the correction wording in the summary', async () => {
		const submit = vi
			.fn()
			.mockRejectedValue(
				appError({ fields: { played_on: ['The date played cannot be in the future.'] } })
			);
		const { screen } = await correcting(submit);
		await screen.getByRole('button', { name: 'Save the correction' }).click();
		await expect.element(screen.getByText('Fix 1 thing to save this correction')).toBeVisible();
		await expect
			.element(screen.getByLabelText('Date played'))
			.toHaveAccessibleDescription(/cannot be in the future/);
	});
});
