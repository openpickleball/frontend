<script lang="ts">
	import { HistoryView } from '#lib/features/matches/index.js';
	import type { PageProps } from './$types';

	// `data` is missing only when a test renders the page on its own.
	let { data }: Partial<PageProps> = $props();
</script>

<svelte:head>
	<title>Matches · OPEN Pickleball</title>
</svelte:head>

<div class="pt-4">
	<HistoryView page={data?.page ?? 1} />
</div>
