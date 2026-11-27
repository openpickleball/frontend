<script lang="ts">
	import { resolve } from '$app/paths';
	import NavBadge from './nav-badge.svelte';
	import NavIcon from './nav-icon.svelte';
	import { isCurrent, navItems, needsYouName } from './nav.js';

	let {
		pathname,
		needsYou = 0,
		organizer = false
	}: { pathname: string; needsYou?: number; organizer?: boolean } = $props();

	const items = $derived(navItems(organizer));
	// Five tabs, or six with Events for an organizer member. Literal classes, so Tailwind sees both.
	const columns = $derived(items.length === 6 ? 'grid-cols-6' : 'grid-cols-5');
</script>

<!-- Mobile only: from 1024px the side nav takes over. -->
<nav
	aria-label="Main"
	class={[
		'fixed inset-x-0 bottom-0 z-20 grid h-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] border-t',
		columns,
		'border-line bg-primary/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden'
	]}
>
	{#each items as item (item.href)}
		{@const current = isCurrent(item, pathname)}
		{@const name = needsYouName(item, item.label, needsYou)}
		<a
			href={resolve(item.href)}
			aria-current={current ? 'page' : undefined}
			class="flex flex-col items-center justify-center gap-1 text-xs tracking-wide text-muted hover:text-secondary focus-visible:-outline-offset-6 aria-[current=page]:font-semibold aria-[current=page]:text-secondary"
		>
			<span class="relative">
				<NavIcon name={item.icon} class={current ? 'size-5 stroke-2' : 'size-5'} />
				{#if item.href === '/' && needsYou > 0}
					<!-- Over the icon's top right corner. -->
					<NavBadge count={needsYou} class="absolute -top-2 left-3" />
				{/if}
			</span>
			{#if name}
				<span aria-hidden="true">{item.label}</span>
				<span class="sr-only">{name}</span>
			{:else}
				{item.label}
			{/if}
		</a>
	{/each}
</nav>
