<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import * as Sidebar from '#lib/ui/sidebar/index.js';
	import { ThemeToggle } from '#lib/ui/theme-toggle/index.js';
	import NavIcon from './nav-icon.svelte';
	import Wordmark from './wordmark.svelte';
	import { NAV_ITEMS, isCurrent } from './nav.js';

	let { pathname, account }: { pathname: string; account?: Snippet } = $props();
</script>

<!-- From 1024px. Below that, the top bar and the tab bar take over. The banner landmark from 1024px. -->
<header class="sticky top-0 hidden h-svh lg:block">
	<Sidebar.Root class="border-r border-sidebar-border">
		<Sidebar.Header class="p-0 pt-8 pr-6 pl-8">
			<Wordmark />
		</Sidebar.Header>
		<!-- Content scrolls on a short window. Its padding leaves room for the pills and the focus ring. -->
		<Sidebar.Content class="pt-8 pr-6 pl-8">
			<nav aria-label="Main">
				<!-- Pulled left so the icons line up with the wordmark. -->
				<Sidebar.Menu class="-ml-3.5 w-auto gap-1">
					{#each NAV_ITEMS as item (item.href)}
						{@const current = isCurrent(item, pathname)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={current}>
								{#snippet child({ props })}
									<a
										{...props}
										href={resolve(item.href)}
										aria-current={current ? 'page' : undefined}
									>
										<NavIcon name={item.icon} />
										{item.sideLabel}
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</nav>
		</Sidebar.Content>
		<Sidebar.Footer class="gap-4 p-0 pt-8 pr-6 pb-6 pl-8">
			{#if account}<div class="flex">{@render account()}</div>{/if}
			<div class="flex items-center justify-between text-sm text-faint">
				<span>Theme</span>
				<ThemeToggle class="-mr-3" />
			</div>
		</Sidebar.Footer>
	</Sidebar.Root>
</header>
