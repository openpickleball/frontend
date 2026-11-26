import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { AppError } from '#lib/api/index.js';
import { buildCode, type MatchCode } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import { myCode } from '#lib/features/players/index.js';
import { matchCache } from '../cache.svelte.js';
import * as services from '../services.js';
import {
	TAMSIN,
	kit,
	oren,
	privatePlayer,
	sampleMatch,
	tamsin,
	team,
	viewerMatch
} from '../testing.js';
import CorrectView from './correct-view.svelte';

vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	getMatch: vi.fn()
}));
const mocked = vi.mocked(services);
vi.mock('svelte-sonner', () => ({ toast: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));

const code = () => sampleMatch().code;
const NEW = buildCode('match', 'FXD00000001') as MatchCode;

beforeEach(() => {
	vi.resetAllMocks();
	matchCache.reset();
	myCode.reset();
	matchCache.setOwnerSource(() => myCode.code);
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	myCode.code = TAMSIN;
	myCode.status = 'ready';
	mocked.getMatch.mockResolvedValue(viewerMatch());
});

afterEach(() => {
	session.reset();
});

describe('CorrectView', () => {
	it('reads the match fresh and fills the form from it', async () => {
		await render(CorrectView, { code: code() });
		await expect
			.element(page.getByRole('heading', { level: 1, name: 'Correct the score' }))
			.toBeVisible();
		await expect.element(page.getByLabelText("Game 2, your team's points")).toHaveValue('9');
		await expect.element(page.getByText('Oren Quill', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Back to the match' }))
			.toHaveAttribute('href', `/matches/${code()}`);
		expect(mocked.getMatch).toHaveBeenCalledWith(code());
	});

	it('saves the correction, tells the cache, and opens the new match', async () => {
		const correction = viewerMatch({ a: true, decision: 'confirm' }, { code: NEW });
		const submit = vi.fn().mockResolvedValue({ match: correction });
		await render(CorrectView, { code: code(), submit });
		await page.getByRole('button', { name: 'Save the correction' }).click();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith(`/matches/${NEW}`));
		expect(toast).toHaveBeenCalledWith('Correction saved');
		expect(matchCache.replacementOf(code())).toBe(NEW);
		expect(matchCache.takeCorrected(NEW)).toBe(true);
	});

	it('explains a confirmed match and links back to it', async () => {
		mocked.getMatch.mockResolvedValue(viewerMatch({ a: true, b: true }, { status: 'confirmed' }));
		await render(CorrectView, { code: code() });
		await expect
			.element(page.getByText("This match is confirmed, so it can't be corrected."))
			.toBeVisible();
		await expect.element(page.getByRole('link', { name: 'See the match' })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Save the correction' }))
			.not.toBeInTheDocument();
	});

	it('explains a match with a private player, whom a correction cannot name', async () => {
		mocked.getMatch.mockResolvedValue(viewerMatch({}, { teamB: team('b', privatePlayer, kit) }));
		await render(CorrectView, { code: code() });
		await expect.element(page.getByText(/has a private account/)).toBeVisible();
	});

	it('says so when the match is not hers or not there', async () => {
		mocked.getMatch.mockRejectedValue(
			new AppError({
				kind: 'not_found',
				status: 404,
				code: 'not_found',
				message: 'Not found.',
				fields: {}
			})
		);
		await render(CorrectView, { code: code() });
		await expect.element(page.getByText(/We couldn't find this match/)).toBeVisible();
	});

	it('offers to try again when the read fails', async () => {
		mocked.getMatch.mockRejectedValueOnce(
			new AppError({ kind: 'server', status: 500, code: 'error', message: 'No.', fields: {} })
		);
		await render(CorrectView, { code: code() });
		await page.getByRole('button', { name: 'Try again' }).click();
		await expect.element(page.getByRole('button', { name: 'Save the correction' })).toBeVisible();
	});

	it('keeps her own side first when she played on team B', async () => {
		mocked.getMatch.mockResolvedValue(
			viewerMatch(
				{},
				{ teamA: team('a', oren), teamB: team('b', tamsin), format: 'singles', viewerSide: 'b' }
			)
		);
		await render(CorrectView, { code: code() });
		await expect.element(page.getByLabelText("Game 1, your team's points")).toHaveValue('7');
	});
});
