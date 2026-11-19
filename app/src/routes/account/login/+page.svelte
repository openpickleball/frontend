<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { LoginForm, SessionCheck, safeNext } from '#lib/features/auth/index.js';

	// Back to where the player was going, but only to a path on this site.
	function signedIn() {
		const next = safeNext(page.url.searchParams.get('next')) ?? '/';
		// If that page can't be opened, go home rather than leave a signed-in player on Sign in.
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- safeNext() allows only same-site paths
		goto(next).catch(() => goto(resolve('/')));
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
