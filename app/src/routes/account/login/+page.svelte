<script lang="ts">
	import { page } from '$app/state';
	import { LoginForm, SessionCheck, goAfterSignIn } from '#lib/features/auth/index.js';

	// Back to where the player was going, but only to a path on this site.
	function signedIn() {
		void goAfterSignIn(page.url.searchParams);
	}
</script>

<svelte:head>
	<title>Sign in · OPEN Pickleball</title>
</svelte:head>

<div class="grid gap-6">
	<!-- When the session could not be read, say so instead of a bare form that looks signed out. -->
	<SessionCheck onsignedin={signedIn} />
	<LoginForm onsuccess={signedIn} />
</div>
