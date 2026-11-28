import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { TAMSIN, games, kit, privatePlayer, sampleMatch, team, viewerMatch } from '../testing.js';
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

	it('says the result in a sentence for screen readers', async () => {
		const screen = await render(Scoreboard, { match: viewerMatch(), you: TAMSIN });
		await expect
			.element(screen.getByTestId('scoreboard-result'))
			.toHaveTextContent('You and Oren Quill beat Bea Marlowe and Kit Ashdown, 11-7, 9-11, 11-4.');
	});

	it('shows names only, with no player codes', async () => {
		const match = sampleMatch();
		const screen = await render(Scoreboard, { match, you: TAMSIN });
		for (const player of [...match.teamA.players, ...match.teamB.players]) {
			expect(screen.container.textContent).not.toContain(player.code!);
		}
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
