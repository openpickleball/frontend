<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { ROUTES } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';

	/** A settings page under Profile: a back link to Profile, the title, then the children. */
	let {
		title,
		children
	}: {
		/** The page title (the `h1`). */
		title: string;
		/** The page content. Each block brings its own space above. */
		children?: Snippet;
	} = $props();
</script>

<!-- Inside pt-4, as the match page is, so the link and title line up. -->
<div class="pt-4">
	<Button
		variant="link"
		href={resolve(ROUTES.profile)}
		class="mt-2 min-h-10 px-0 text-base font-normal text-muted"
	>
		<ArrowLeftIcon class="size-4" aria-hidden="true" />Profile
	</Button>

	<div class="pt-4">
		<h1 class="page-title">{title}</h1>
	</div>

	{@render children?.()}
</div>
