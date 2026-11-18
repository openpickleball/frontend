<script lang="ts">
	import { ResetForm } from '#lib/features/auth/index.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

<svelte:head>
	<title>Choose a new password · OPEN Pickleball</title>
</svelte:head>

<div class="max-w-[420px] pt-4">
	<ResetForm key={params.key} />
</div>
