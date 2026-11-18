<script lang="ts">
	import type { Snippet } from 'svelte';
	import SideNav from './side-nav.svelte';
	import TabBar from './tab-bar.svelte';
	import TopBar from './top-bar.svelte';

	let { pathname, children }: { pathname: string; children: Snippet } = $props();
</script>

<a
	href="#main"
	class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-secondary focus:px-5 focus:py-2.5 focus:text-primary"
>
	Skip to content
</a>

<div class="min-h-svh shell:grid shell:grid-cols-[248px_1fr]">
	<SideNav {pathname} />
	<div>
		<TopBar />
		<!-- One column, 720px wide, with the site gutter. Room below for the tab bar on mobile. -->
		<main
			id="main"
			class="mx-auto w-full max-w-[calc(720px+2*var(--spacing-gutter))] pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))] pt-2 pb-[calc(var(--tabbar-height)+56px+env(safe-area-inset-bottom))] shell:pt-12 shell:pb-24"
		>
			{@render children()}
		</main>
	</div>
	<TabBar {pathname} />
</div>
