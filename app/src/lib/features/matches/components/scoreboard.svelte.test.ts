import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { TAMSIN, games, kit, privatePlayer, sampleMatch, team, tamsin } from '../testing.js';
import MatchRow from './match-row.svelte';
import Scoreboard from './scoreboard.svelte';

describe('Scoreboard', () => {
	it('has a table for screen readers with a row per team and a column per game', async () => {
		const screen = await render(Scoreboard, { match: sampleMatch(), you: TAMSIN });
		const table = screen.getByRole('table', { name: 'Score by game' });
		await expect.element(table).toBeInTheDocument();
		await expect.element(screen.getByRole('columnheader', { name: 'Game 3' })).toBeInTheDocument();
		await expect
			.element(screen.getByRole('rowheader', { name: 'Tamsin Vale (you) and Oren Quill, winners' }))
			.toBeInTheDocument();
		await expect
			.element(screen.getByRole('rowheader', { name: 'Bea Marlowe and Kit Ashdown' }))
			.toBeInTheDocument();
	});

	it('names the winner in words, not only in bold', async () => {
		const screen = await render(Scoreboard, { match: sampleMatch(), you: TAMSIN });
		await expect.element(screen.getByText('Won 2–1')).toBeVisible();
	});

	it('shows no winner tag while the match has none', async () => {
		const screen = await render(Scoreboard, {
			match: sampleMatch({ games: games([11, 7]) }),
			you: TAMSIN
		});
		await expect.element(screen.getByText(/^Won /)).not.toBeInTheDocument();
	});

	it('shows a private player without a code', async () => {
		const match = sampleMatch({ teamB: team('b', privatePlayer, kit) });
		const screen = await render(Scoreboard, { match, you: TAMSIN });
		await expect.element(screen.getByText('Private player')).toBeVisible();
	});
});

describe('MatchRow', () => {
	it('is one link named by a sentence about the match', async () => {
		const screen = await render(MatchRow, { match: sampleMatch(), you: TAMSIN });
		const link = screen.getByRole('link');
		await expect
			.element(link)
			.toHaveAccessibleName(
				'14 Nov 2026, Doubles, best of 3. Tamsin Vale (you) and Oren Quill beat Bea Marlowe and Kit Ashdown, 11-7, 9-11, 11-4. Pending. Waiting on a confirmation.'
			);
		await expect.element(link).toHaveAttribute('href', expect.stringContaining('/matches/M-'));
	});

	it('says "waiting on a confirmation" until the player acts here', async () => {
		const unknown = await render(MatchRow, { match: sampleMatch(), you: TAMSIN });
		await expect.element(unknown.getByText(/Waiting for the other team/)).not.toBeInTheDocument();
		await expect.element(unknown.getByText('Waiting on a confirmation.')).toBeVisible();
	});

	it('says "waiting for the other team" after the player confirmed here', async () => {
		const confirmed = await render(MatchRow, {
			match: sampleMatch(),
			you: TAMSIN,
			acted: 'confirm'
		});
		await expect.element(confirmed.getByText(/Waiting for the other team/)).toBeVisible();
		await expect.element(confirmed.getByText('Waiting on a confirmation.')).not.toBeInTheDocument();
	});

	it('writes the weekday, and "You" for the player\'s own team', async () => {
		const screen = await render(MatchRow, { match: sampleMatch(), you: TAMSIN });
		await expect.element(screen.getByText(/Sat 14 Nov/)).toBeInTheDocument();
		await expect.element(screen.getByText('You & Oren Quill')).toBeInTheDocument();
		await expect.element(screen.getByText('Bea Marlowe & Kit Ashdown')).toBeInTheDocument();
	});

	it('does not say it for a match that already counts', async () => {
		const screen = await render(MatchRow, {
			match: sampleMatch({ status: 'confirmed', teamA: team('a', tamsin) }),
			you: TAMSIN,
			acted: 'confirm'
		});
		await expect.element(screen.getByText(/Waiting for the other team/)).not.toBeInTheDocument();
		await expect.element(screen.getByText('Waiting on a confirmation.')).not.toBeInTheDocument();
	});
});
