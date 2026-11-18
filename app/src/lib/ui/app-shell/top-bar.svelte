<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ThemeToggle } from '#lib/ui/theme-toggle/index.js';
	import Wordmark from './wordmark.svelte';

	let { always = false, account }: { always?: boolean; account?: Snippet } = $props();
</script>

<!-- Mobile only: from 960px the side nav takes over, unless `always` (pages with no side nav). -->
<header
	class={[
		'sticky top-0 z-20 flex h-(--header-height) items-center justify-between gap-4 bg-primary/80 pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))] backdrop-blur-md',
		!always && 'shell:hidden'
	]}
>
	<Wordmark />
	<div class="flex items-center gap-3">
		{@render account?.()}
		<ThemeToggle class="-mr-2" />
	</div>
</header>
