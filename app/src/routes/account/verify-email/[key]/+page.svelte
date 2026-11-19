<script lang="ts">
	import { VerifyEmail } from '#lib/features/auth/index.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

<svelte:head>
	<!-- The key is in the URL: don't pass it on in a Referer header. -->
	<meta name="referrer" content="no-referrer" />
	<title>Verify your email · OPEN Pickleball</title>
</svelte:head>

<VerifyEmail key={params.key} />
