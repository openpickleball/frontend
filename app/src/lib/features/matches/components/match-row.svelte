<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Match, PlayerCode } from '#lib/domain/index.js';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import {
		formatName,
		formatShortDate,
		matchTags,
		resultWord,
		rowLabel,
		rowPlayers,
		scoreLine,
		viewpoint
	} from '../format.js';
	import { matchCache } from '../cache.svelte.js';
	import MatchTags from './match-tags.svelte';

	/**
	 * One match in a list, the same on Home's Needs you and on Matches: the format and date with the
	 * score and the result, who played, then the tags. The whole row opens the match page, where
	 * Confirm, Dispute and Vouch are.
	 */
	let {
		match,
		you
	}: {
		match: Match;
		/** The signed-in player's code. The row reads the match from their team's side. */
		you: PlayerCode;
	} = $props();

	// Known from the holds list only: `MatchOut` has no hold field.
	const hold = $derived(match.status === 'voided' ? undefined : matchCache.holdOf(match.code));
	const tags = $derived(matchTags(match, hold));
	const result = $derived(resultWord(match));
</script>

<a
	href={resolve('/matches/[code]', { code: match.code })}
	class="group -mx-2 flex items-center gap-2 px-2 py-4 hover:bg-surface active:bg-surface"
	data-testid="match-row"
	data-status={match.status}
>
	<!-- The link's name is this sentence. The drawn row below repeats it for the eye. -->
	<span class="sr-only">{rowLabel(match, you, hold)}</span>
	<div class="min-w-0 flex-1" aria-hidden="true">
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<p class="font-semibold text-secondary">
					{formatName(match.format)} · {formatShortDate(match.playedOn)}
				</p>
				<p class="mt-1 text-sm text-muted" data-testid="row-players">{rowPlayers(match, you)}</p>
			</div>
			<div class="flex-none text-right">
				<p
					class={[
						'text-secondary tabular-nums',
						match.status === 'voided' && 'line-through decoration-faint'
					]}
					data-testid="row-score"
				>
					{scoreLine(match, viewpoint(match))}
				</p>
				{#if result}
					<p
						class={[
							'mt-1 text-sm',
							result === 'Won' ? 'font-semibold text-secondary' : 'text-muted'
						]}
						data-testid="row-result"
					>
						{result}
					</p>
				{/if}
			</div>
		</div>
		<MatchTags {tags} class="mt-2" />
	</div>
	<!-- Shows the row opens. Hidden from screen readers: the link's name already says it. -->
	<ChevronRight
		class="size-4 flex-none text-faint group-hover:text-secondary motion-safe:transition motion-safe:group-hover:translate-x-0.5"
		aria-hidden="true"
		data-testid="row-chevron"
	/>
</a>
