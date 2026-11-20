<script lang="ts">
	import { resolve } from '$app/paths';
	import NavIcon from './nav-icon.svelte';
	import { NAV_ITEMS, isCurrent } from './nav.js';

	let { pathname }: { pathname: string } = $props();
</script>

<!-- Mobile only: from 1024px the side nav takes over. -->
<nav
	aria-label="Main"
	class="fixed inset-x-0 bottom-0 z-20 grid h-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] grid-cols-4 border-t border-line bg-primary/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
>
	{#each NAV_ITEMS as item (item.href)}
		{@const current = isCurrent(item, pathname)}
		<a
			href={resolve(item.href)}
			aria-current={current ? 'page' : undefined}
			class="flex flex-col items-center justify-center gap-1 text-xs tracking-wide text-muted hover:text-secondary focus-visible:-outline-offset-6 aria-[current=page]:font-semibold aria-[current=page]:text-secondary"
		>
			<NavIcon name={item.icon} class={current ? 'size-5 stroke-2' : 'size-5'} />
			{item.label}
		</a>
	{/each}
</nav>
