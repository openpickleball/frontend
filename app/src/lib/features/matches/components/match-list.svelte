<script lang="ts">
	import type { Match, PlayerCode } from '#lib/domain/index.js';
	import { matchCache } from '../cache.svelte.js';
	import MatchRow from './match-row.svelte';

	let {
		matches,
		you,
		label
	}: {
		matches: readonly Match[];
		you: PlayerCode;
		/** Names the list for screen readers. */
		label: string;
	} = $props();
</script>

<ul class="grid border-b border-line" aria-label={label}>
	{#each matches as match (match.code)}
		<li class="border-t border-line">
			<MatchRow {match} {you} acted={matchCache.actedOn(match.code)} />
		</li>
	{/each}
</ul>
