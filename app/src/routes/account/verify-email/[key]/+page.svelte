<script lang="ts">
	import { VerifyEmail } from '#lib/features/auth/index.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

<svelte:head>
	<title>Verify your email · OPEN Pickleball</title>
</svelte:head>

<div class="max-w-[420px] pt-4">
	<VerifyEmail key={params.key} />
</div>
