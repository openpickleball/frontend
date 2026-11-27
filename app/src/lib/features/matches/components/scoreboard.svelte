<script lang="ts">
	import { winner, type Match, type PlayerCode } from '#lib/domain/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import { matchHeadline, scoreLine, sideScores, teamNames, viewpoint, wonTag } from '../format.js';

	let { match, you }: { match: Match; you: PlayerCode } = $props();

	const first = $derived(viewpoint(match));
	const teams = $derived(
		(first === 'a' ? (['a', 'b'] as const) : (['b', 'a'] as const)).map((side) => {
			const team = side === 'a' ? match.teamA : match.teamB;
			return {
				side,
				team,
				scores: sideScores(match, side),
				won: winner(match) === side,
				names: teamNames(team, you)
			};
		})
	);
	const columns = $derived(`1fr repeat(${match.games.length}, 40px)`);
</script>

<Section title="Score">
	<!-- The sentence and the table are for screen readers. The grid below is the same data, drawn
	     for the eye. The page title says only the format and date, so the sentence gives the result. -->
	<div class="sr-only">
		<p data-testid="scoreboard-result">
			{matchHeadline(match, you)}, {scoreLine(match, first)}.
		</p>
		<table>
			<caption>Score by game</caption>
			<thead>
				<tr>
					<th scope="col">Team</th>
					{#each match.games as game (game.number)}
						<th scope="col">Game {game.number}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each teams as row (row.side)}
					<tr>
						<th scope="row">{row.names}{row.won ? ', winners' : ''}</th>
						{#each row.scores as score, index (index)}
							<td>{score.points}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div aria-hidden="true">
		<div
			class="grid items-center gap-x-1.5 pb-2 text-right text-sm text-muted"
			style:grid-template-columns={columns}
		>
			<span class="text-left">Team</span>
			{#each match.games as game (game.number)}
				<span>G{game.number}</span>
			{/each}
		</div>
		{#each teams as row (row.side)}
			<div
				class="grid items-start gap-x-1.5 border-t border-line py-5"
				style:grid-template-columns={columns}
				data-testid="scoreboard-team"
			>
				<div class="grid min-w-0 gap-1.5">
					{#each row.team.players as player, index (index)}
						<!-- Names only: player codes don't help on a match you played. -->
						<span class="text-lg wrap-anywhere {row.won ? 'font-semibold' : ''}">
							{player.displayName}{you && player.code === you ? ' (you)' : ''}
						</span>
					{/each}
					{#if row.won}
						<span class="mt-0.5 text-sm font-semibold text-secondary">
							{wonTag(match, row.side)}
						</span>
					{/if}
				</div>
				{#each row.scores as score, index (index)}
					<span
						class="text-right text-2xl tabular-nums {score.won
							? 'font-semibold text-secondary'
							: 'text-muted'}"
					>
						{score.points}
					</span>
				{/each}
			</div>
		{/each}
	</div>
</Section>
