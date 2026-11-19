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
		account
	}: {
		pathname: string;
		children: Snippet;
		/** No side nav or tab bar, for the sign-in and other account pages. */
		bare?: boolean;
		/** Account actions, such as a sign out button: in the top bar and the foot of the side nav. */
		account?: Snippet;
	} = $props();
</script>

<a
	href="#main"
	class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-secondary focus:px-5 focus:py-2.5 focus:text-primary"
>
	Skip to content
</a>

<div class={['min-h-svh', !bare && 'shell:grid shell:grid-cols-[248px_1fr]']}>
	{#if !bare}<SideNav {pathname} {account} />{/if}
	<div>
		<TopBar always={bare} {account} />
		<!-- One column, 720px wide, with the site gutter. Room below for the tab bar on mobile. -->
		<main
			id="main"
			class={[
				'mx-auto w-full max-w-[calc(720px+2*var(--spacing-gutter))] pt-2 pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))] shell:pt-12',
				'pb-16'
			]}
		>
			{@render children()}
		</main>
		<SiteFooter {bare} />
	</div>
	{#if !bare}<TabBar {pathname} />{/if}
</div>
