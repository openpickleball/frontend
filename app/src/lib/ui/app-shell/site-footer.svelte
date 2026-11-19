<script lang="ts">
	/** Where the app's source code lives. AGPL-3.0-or-later asks a hosted version to link to it. */
	const SOURCE_URL = 'https://github.com/openpickleball/frontend';

	/** No tab bar (the account pages), so there is nothing to clear at the bottom. */
	let { bare = false }: { bare?: boolean } = $props();
</script>

<!-- Every page, signed in or out. With the tab bar it clears the bar and the home indicator. -->
<footer
	class={[
		'mx-auto w-full max-w-[calc(720px+2*var(--spacing-gutter))] pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))]',
		bare ? 'pb-12' : 'pb-[calc(var(--tabbar-height)+24px+env(safe-area-inset-bottom))] shell:pb-12'
	]}
>
	<p class="border-t border-line pt-6 text-[13px] text-faint">
		OpenPB is open-source software under the AGPL-3.0-or-later license.
		<a
			href={SOURCE_URL}
			target="_blank"
			rel="noopener"
			class="text-muted underline underline-offset-2 hover:text-secondary"
			>View the source code<span class="sr-only"> (opens in a new tab)</span></a
		>
	</p>
</footer>
