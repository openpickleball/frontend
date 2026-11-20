<script lang="ts">
	import { page } from '$app/state';
	import { SignupForm, goAfterSignIn } from '#lib/features/auth/index.js';
</script>

<svelte:head>
	<title>Create account · OPEN Pickleball</title>
</svelte:head>

<SignupForm onsuccess={() => void goAfterSignIn(page.url.searchParams)} />
