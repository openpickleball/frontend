<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		needsViewerConfirmation,
		waitingOnOtherTeam,
		winner,
		type Match,
		type PlayerCode
	} from '#lib/domain/index.js';
	import { Badge } from '#lib/ui/badge/index.js';
	import {
		STATUS_LABELS,
		formatName,
		formatShortDate,
		rowLabel,
		rowTeamNames,
		sideScores,
		viewpoint
	} from '../format.js';

	let {
		match,
		you
	}: {
		match: Match;
		/** The signed-in player's code. The row reads the match from their team's side. */
		you: PlayerCode;
	} = $props();

	const mine = $derived(viewpoint(match, you));
	const rows = $derived(
		(mine === 'a' ? (['a', 'b'] as const) : (['b', 'a'] as const)).map((side) => ({
			side,
			names: rowTeamNames(side === 'a' ? match.teamA : match.teamB, you),
			scores: sideScores(match, side),
			won: winner(match) === side
		}))
	);
	const games = $derived(match.games.length === 1 ? '1 game' : `${match.games.length} games`);
	// What the player can do about a pending match, from what the API says about their team.
	const note = $derived.by(() => {
		if (needsViewerConfirmation(match)) return 'Needs your confirmation.';
		if (waitingOnOtherTeam(match)) {
			return match.viewerDecision === 'confirm'
				? 'You confirmed this score. Waiting for the other team.'
				: 'Your team confirmed this score. Waiting for the other team.';
		}
		return null;
	});
</script>

<a
	href={resolve('/matches/[code]', { code: match.code })}
	class="block py-4"
	data-testid="match-row"
	data-status={match.status}
>
	<!-- The link's name is this sentence. The drawn row below repeats it for the eye. -->
	<span class="sr-only">{rowLabel(match, you)}</span>
	<div class="mb-3 flex items-center justify-between gap-3 text-base text-muted" aria-hidden="true">
		<span>{formatShortDate(match.playedOn)} · {formatName(match.format)}, {games}</span>
		<Badge variant={match.status}>{STATUS_LABELS[match.status]}</Badge>
	</div>
	<!-- eslint-disable local/no-arbitrary-tailwind-values -- label and score columns, no default grid template -->
	<div
		class="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 {match.status === 'voided'
			? 'line-through decoration-faint'
			: ''}"
		aria-hidden="true"
	>
		{#each rows as row (row.side)}
			<span class="min-w-0 truncate {row.won ? 'font-semibold text-secondary' : 'text-muted'}"
				>{row.names}</span
			>
			<span class="flex gap-1 tabular-nums">
				{#each row.scores as score, index (index)}
					<span
						class="min-w-8 text-right {score.won ? 'font-semibold text-secondary' : 'text-muted'}"
						>{score.points}</span
					>
				{/each}
			</span>
		{/each}
	</div>
	<!-- eslint-enable local/no-arbitrary-tailwind-values -->
	{#if note}
		<p class="mt-2 text-sm text-muted">{note}</p>
	{/if}
</a>
