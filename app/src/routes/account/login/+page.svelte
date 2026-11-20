<script lang="ts">
	import { page } from '$app/state';
	import { LoginForm, goAfterSignIn } from '#lib/features/auth/index.js';

	// Back to where the player was going, but only to a path on this site.
	function signedIn() {
		void goAfterSignIn(page.url.searchParams);
	}
</script>

<svelte:head>
	<title>Sign in · OPEN Pickleball</title>
</svelte:head>

<LoginForm onsuccess={signedIn} />
