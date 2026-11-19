<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyTitle
	} from '#lib/ui/empty/index.js';

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? "We couldn't find this page" : 'Something went wrong');
</script>

<svelte:head>
	<title>{title} | OPEN Pickleball</title>
</svelte:head>

<Empty class="mt-4">
	<EmptyHeader>
		<EmptyTitle level="h1">{title}</EmptyTitle>
		<EmptyDescription>
			{#if notFound}
				<p>Check the address, or go back home.</p>
			{:else}
				<p>This page didn't load. Wait a moment and try again, or go back home.</p>
			{/if}
		</EmptyDescription>
	</EmptyHeader>
	<EmptyContent>
		<Button href={resolve('/')}>Back to home</Button>
	</EmptyContent>
</Empty>
