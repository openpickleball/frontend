<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		needsViewerConfirmation,
		waitingOnOtherTeam,
		winner,
		type Match,
		type PlayerCode
	} from '#lib/domain/index.js';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Badge } from '#lib/ui/badge/index.js';
	import {
		ON_HOLD_LABEL,
		STATUS_LABELS,
		formatName,
		formatShortDate,
		rowLabel,
		rowTeamNames,
		sideScores,
		viewpoint
	} from '../format.js';
	import { matchCache } from '../cache.svelte.js';
	import { needsYouActions } from '../needs-you.svelte.js';
	import type { RowList } from './row-list.js';

	let {
		match,
		you,
		listOf
	}: {
		match: Match;
		/** The signed-in player's code. The row reads the match from their team's side. */
		you: PlayerCode;
		/**
		 * The list the row sits in, when its title already says something the note would repeat.
		 * The note then leaves that part out.
		 */
		listOf?: RowList;
	} = $props();

	const mine = $derived(viewpoint(match));
	const rows = $derived(
		(mine === 'a' ? (['a', 'b'] as const) : (['b', 'a'] as const)).map((side) => ({
			side,
			names: rowTeamNames(side === 'a' ? match.teamA : match.teamB, you),
			scores: sideScores(match, side),
			won: winner(match) === side
		}))
	);
	// Known from the holds list only: `MatchOut` has no hold field.
	const hold = $derived(match.status === 'voided' ? undefined : matchCache.holdOf(match.code));
	// A held pending or confirmed match reads On hold in place of its status. A disputed one keeps
	// Disputed, which says more.
	const showHold = $derived(hold !== undefined && match.status !== 'disputed');
	const games = $derived(match.games.length === 1 ? '1 game' : `${match.games.length} games`);
	// What the player can do about a pending match, from what the API says about their team, and
	// whose dispute a disputed match waits on. In a list whose title says it already, the note
	// keeps only what the title doesn't say.
	const note = $derived.by(() => {
		// Under Needs you, the note is what the player can do.
		if (listOf === 'needs-you') {
			const actions = needsYouActions(match, hold);
			if (actions.length === 2)
				return "Confirm or dispute the score, and vouch for it. It's on hold.";
			if (actions[0] === 'confirm') return 'Confirm or dispute the score.';
			if (actions[0] === 'vouch') return "Vouch for it. It's on hold.";
		}
		if (match.status === 'disputed' && match.viewerDecision === 'dispute') {
			return 'You disputed this score.';
		}
		if (hold) {
			if (listOf === 'on-hold') return hold.vouched ? 'Your team has vouched for it.' : null;
			return hold.vouched
				? "On hold. It doesn't count yet. Your team has vouched for it."
				: "On hold. It doesn't count yet. Open it to vouch for it.";
		}
		if (needsViewerConfirmation(match)) return 'Needs your confirmation.';
		if (waitingOnOtherTeam(match)) {
			const who =
				match.viewerDecision === 'confirm'
					? 'You confirmed this score.'
					: 'Your team confirmed this score.';
			return `${who} Waiting for the other team.`;
		}
		return null;
	});
</script>

<a
	href={resolve('/matches/[code]', { code: match.code })}
	class="group -mx-2 flex items-stretch gap-2 px-2 py-4 hover:bg-surface active:bg-surface"
	data-testid="match-row"
	data-status={match.status}
>
	<!-- The link's name is this sentence. The drawn row below repeats it for the eye. -->
	<span class="sr-only">{rowLabel(match, you, showHold)}</span>
	<div class="min-w-0 flex-1">
		<div
			class="mb-3 flex items-center justify-between gap-3 text-base text-muted"
			aria-hidden="true"
		>
			<span>{formatShortDate(match.playedOn)} · {formatName(match.format)}, {games}</span>
			<!-- One badge: a second one wraps the date on a phone. A held pending or confirmed match
			     shows On hold in place of its status, as the match page does (S4), so the badge never
			     says Confirmed while the note says it doesn't count. A disputed one keeps Disputed. -->
			{#if showHold}
				<Badge>{ON_HOLD_LABEL}</Badge>
			{:else}
				<Badge variant={match.status}>{STATUS_LABELS[match.status]}</Badge>
			{/if}
		</div>
		<!-- eslint-disable local/no-arbitrary-tailwind-values -- label and score columns, no default grid template -->
		<div
			class="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 {match.status === 'voided'
				? 'line-through decoration-faint'
				: ''}"
			aria-hidden="true"
		>
			{#each rows as row (row.side)}
				<span class="min-w-0 truncate {row.won ? 'font-semibold text-secondary' : 'text-muted'}">
					{row.names}
				</span>
				<span class="flex divide-x divide-line tabular-nums">
					{#each row.scores as score, index (index)}
						<span
							class="min-w-10 px-2 text-right {score.won
								? 'font-semibold text-secondary'
								: 'text-muted'}"
						>
							{score.points}
						</span>
					{/each}
				</span>
			{/each}
		</div>
		<!-- eslint-enable local/no-arbitrary-tailwind-values -->
		{#if note}
			<p class="mt-2 text-sm text-muted">{note}</p>
		{/if}
	</div>
	<!-- Shows the row opens. Hidden from screen readers: the link's name already says it. -->
	<ChevronRight
		class="size-4 flex-none self-center text-faint group-hover:text-secondary motion-safe:transition motion-safe:group-hover:translate-x-0.5"
		aria-hidden="true"
	/>
</a>
