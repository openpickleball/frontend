<script lang="ts">
	import { Badge, type BadgeVariant } from '#lib/ui/badge/index.js';
	import type { MatchTag } from '../format.js';

	/**
	 * A match's tags (`matchTags`) on one line, wrapping when they don't fit: in its row and at the
	 * top of its page. Tags that ask something of the player use the warning color.
	 */
	let { tags, class: className }: { tags: readonly MatchTag[]; class?: string } = $props();

	function variantOf(tag: MatchTag): BadgeVariant {
		if (tag.tone === 'action') return 'warning';
		if (tag.tone === 'held') return 'neutral';
		return tag.tone;
	}
</script>

<div class={['flex flex-wrap items-center gap-2', className]} data-testid="match-tags">
	{#each tags as tag (tag.label)}
		<Badge variant={variantOf(tag)} data-tone={tag.tone}>{tag.label}</Badge>
	{/each}
</div>
