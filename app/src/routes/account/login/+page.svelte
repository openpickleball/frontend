<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LoginForm, safeNext } from '#lib/features/auth/index.js';

	// Back to where the player was going, but only to a path on this site.
	function signedIn() {
		const next = safeNext(page.url.searchParams.get('next')) ?? '/';
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- safeNext() allows only same-site paths
		void goto(next);
	}
</script>

<svelte:head>
	<title>Sign in · OPEN Pickleball</title>
</svelte:head>

<div class="max-w-[420px] pt-4">
	<LoginForm onsuccess={signedIn} />
</div>
