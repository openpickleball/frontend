<script lang="ts">
	import type { Match, PlayerCode } from '#lib/domain/index.js';
	import MatchRow from './match-row.svelte';
	import type { RowList } from './row-list.js';

	let {
		matches,
		you,
		label,
		listOf,
		inSection = false,
		underTitle = false
	}: {
		matches: readonly Match[];
		you: PlayerCode;
		/** Names the list for screen readers. */
		label: string;
		/** What the list's title says, so the rows don't say it again. See `MatchRow`. */
		listOf?: RowList;
		/**
		 * The list sits right under a section title, whose line is just above. The first row then
		 * drops its top border, so there are never two lines in a row.
		 */
		underTitle?: boolean;
		/**
		 * The list sits in a section. It drops its bottom border, because the line above the next
		 * section closes it.
		 */
		inSection?: boolean;
	} = $props();
</script>

<ul class={['grid', !inSection && 'border-b border-line']} aria-label={label}>
	{#each matches as match (match.code)}
		<li class={['border-t border-line', underTitle && 'first:border-t-0']}>
			<MatchRow {match} {you} {listOf} />
		</li>
	{/each}
</ul>
