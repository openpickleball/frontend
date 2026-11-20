<script lang="ts">
	import { ThemeToggle } from '#lib/ui/theme-toggle/index.js';
	import Wordmark from './wordmark.svelte';

	let { always = false }: { always?: boolean } = $props();
</script>

<!-- Mobile only: from 1024px the side nav takes over, unless `always` (pages with no side nav). -->
<header
	class={[
		'sticky top-0 z-20 flex h-(--header-height) items-center justify-between gap-4 bg-primary/80 pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))] backdrop-blur-md',
		!always && 'lg:hidden'
	]}
>
	<Wordmark />
	<ThemeToggle class="-mr-3" />
</header>
