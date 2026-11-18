<script lang="ts">
	import { MatchView } from '#lib/features/matches/index.js';
	import type { PageProps } from './$types';

	// `params` is missing only when a test renders the page on its own.
	let { params }: Partial<PageProps> = $props();
</script>

<svelte:head>
	<title>Match · OPEN Pickleball</title>
</svelte:head>

<div class="pt-4">
	<MatchView code={params?.code ?? ''} />
</div>
