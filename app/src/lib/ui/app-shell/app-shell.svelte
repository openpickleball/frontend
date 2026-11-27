<script lang="ts">
	import type { Snippet } from 'svelte';
	import SiteFooter from './site-footer.svelte';
	import SideNav from './side-nav.svelte';
	import TabBar from './tab-bar.svelte';
	import TopBar from './top-bar.svelte';

	let {
		pathname,
		children,
		bare = false,
		account,
		needsYou = 0,
		organizer = false
	}: {
		pathname: string;
		children: Snippet;
		/** No side nav or tab bar, for the sign-in and other account pages. */
		bare?: boolean;
		/** Account actions, such as a sign out button, at the foot of the side nav. On a phone, the profile page has them. */
		account?: Snippet;
		/** How many matches need the player. Above 0, the Home item shows it as a badge. */
		needsYou?: number;
		/** An organizer member: the navs add the Events entry. Display only. */
		organizer?: boolean;
	} = $props();
</script>

<a
	href="#main"
	class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-secondary focus:px-5 focus:py-2.5 focus:text-primary"
>
	Skip to content
</a>

<!-- eslint-disable-next-line local/no-arbitrary-tailwind-values -- side nav column beside the page, no default template -->
<div class={['min-h-svh', !bare && 'lg:grid lg:grid-cols-[auto_1fr]']}>
	{#if !bare}<SideNav {pathname} {account} {needsYou} {organizer} />{/if}
	<div>
		<TopBar always={bare} />
		<!-- One column, 672px wide, with the site gutter. Room below for the tab bar on mobile. -->
		<main
			id="main"
			class={[
				'mx-auto w-full max-w-[calc(var(--container-2xl)+2*var(--spacing-gutter))] pt-2 pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))] lg:pt-12',
				'pb-16'
			]}
		>
			{@render children()}
		</main>
		<SiteFooter {bare} />
	</div>
	{#if !bare}<TabBar {pathname} {needsYou} {organizer} />{/if}
</div>
