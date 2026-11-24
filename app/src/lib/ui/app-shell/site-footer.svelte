<script lang="ts">
	import { NEW_TAB, PRIVACY_URL, TERMS_URL } from '#lib/ui/legal.js';

	/** Where the app's source code lives. AGPL-3.0-or-later asks a hosted version to link to it. */
	const SOURCE_URL = 'https://github.com/openpickleball/frontend';

	/** No tab bar (the account pages), so there is nothing to clear at the bottom. */
	let { bare = false }: { bare?: boolean } = $props();
</script>

<!-- Every page, signed in or out. With the tab bar it clears the bar and the home indicator. -->
<footer
	class={[
		'mx-auto w-full max-w-[calc(var(--container-2xl)+2*var(--spacing-gutter))] pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))]',
		bare ? 'pb-12' : 'pb-[calc(var(--tabbar-height)+24px+env(safe-area-inset-bottom))] lg:pb-12'
	]}
>
	<p class="border-t border-line pt-6 text-sm text-faint">
		OpenPB is open-source software under the AGPL-3.0-or-later license.
		<a
			href={SOURCE_URL}
			target="_blank"
			rel="noopener"
			class="text-muted underline underline-offset-2 hover:text-secondary"
		>
			View the source code<span class="sr-only"> (opens in a new tab)</span>
		</a>
	</p>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- off-site openpb.org pages, resolve() is for app routes -->
	<p class="mt-2 flex flex-wrap gap-x-4 text-sm">
		<a
			href={TERMS_URL}
			target="_blank"
			rel="noopener"
			class="text-muted underline underline-offset-2 hover:text-secondary"
		>
			Terms<span class="sr-only">{NEW_TAB}</span>
		</a>
		<a
			href={PRIVACY_URL}
			target="_blank"
			rel="noopener"
			class="text-muted underline underline-offset-2 hover:text-secondary"
		>
			Privacy<span class="sr-only">{NEW_TAB}</span>
		</a>
	</p>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</footer>
