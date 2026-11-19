<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { ThemeToggle } from '#lib/ui/theme-toggle/index.js';
	import NavIcon from './nav-icon.svelte';
	import Wordmark from './wordmark.svelte';
	import { NAV_ITEMS, isCurrent } from './nav.js';

	let { pathname, account }: { pathname: string; account?: Snippet } = $props();
</script>

<!-- From 960px. Below that, the top bar and the tab bar take over. -->
<div
	class="sticky top-0 hidden h-svh flex-col gap-10 border-r border-line pt-7 pr-6 pb-6 pl-8 shell:flex"
>
	<Wordmark />
	<nav aria-label="Main">
		<ul class="grid gap-1">
			{#each NAV_ITEMS as item (item.href)}
				<li>
					<a
						href={resolve(item.href)}
						aria-current={isCurrent(item, pathname) ? 'page' : undefined}
						class="-ml-3.5 flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] text-muted hover:text-secondary aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-secondary aria-[current=page]:shadow-[inset_0_0_0_1px_var(--color-line)]"
					>
						<NavIcon name={item.icon} class="size-[22px]" />
						{item.sideLabel}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
	<div class="mt-auto grid gap-4">
		{#if account}<div class="flex">{@render account()}</div>{/if}
		<div class="flex items-center justify-between text-[13px] text-faint">
			<span>Theme</span>
			<ThemeToggle />
		</div>
	</div>
</div>
