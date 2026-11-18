<script lang="ts">
	import { resolve } from '$app/paths';
	import { isPending, myTeam, winner, type Match, type PlayerCode } from '#lib/domain/index.js';
	import { Badge } from '#lib/ui/badge/index.js';
	import type { MatchAction } from '../cache.svelte.js';
	import {
		STATUS_LABELS,
		formatDate,
		formatName,
		rowLabel,
		sideScores,
		teamNames,
		viewpoint
	} from '../format.js';

	let {
		match,
		you,
		acted
	}: {
		match: Match;
		/** The signed-in player's code. The row reads the match from their team's side. */
		you: PlayerCode;
		/** What the player did to this match in this session, if anything. */
		acted?: MatchAction;
	} = $props();

	const mine = $derived(viewpoint(match, you));
	const rows = $derived(
		(mine === 'a' ? (['a', 'b'] as const) : (['b', 'a'] as const)).map((side) => ({
			side,
			names: teamNames(side === 'a' ? match.teamA : match.teamB),
			scores: sideScores(match, side),
			won: winner(match) === side
		}))
	);
	const games = $derived(match.games.length === 1 ? '1 game' : `${match.games.length} games`);
	const note = $derived(
		isPending(match) && myTeam(match, you) && acted === 'confirm'
			? 'You confirmed this score. Waiting for the other team.'
			: null
	);
</script>

<a
	href={resolve('/matches/[code]', { code: match.code })}
	class="block py-4 pb-[18px] focus-visible:outline-offset-2"
	data-testid="match-row"
	data-status={match.status}
>
	<!-- The link's name is this sentence. The drawn row below repeats it for the eye. -->
	<span class="sr-only">{rowLabel(match, you)}</span>
	<div
		class="mb-2.5 flex items-center justify-between gap-3 text-[14px] text-muted"
		aria-hidden="true"
	>
		<span>{formatDate(match.playedOn)} · {formatName(match.format)}, {games}</span>
		<Badge variant={match.status}>{STATUS_LABELS[match.status]}</Badge>
	</div>
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
						class="min-w-[26px] text-right {score.won
							? 'font-semibold text-secondary'
							: 'text-muted'}">{score.points}</span
					>
				{/each}
			</span>
		{/each}
	</div>
	{#if note}
		<p class="mt-2 text-[13px] text-muted">{note}</p>
	{/if}
</a>
