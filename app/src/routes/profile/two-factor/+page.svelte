<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import { TwoFactorSettings, session } from '#lib/features/auth/index.js';
	import { Button } from '#lib/ui/button/index.js';
</script>

<svelte:head>
	<title>Two-factor authentication · OPEN Pickleball</title>
</svelte:head>

<div class="pt-4">
	<Button variant="link" href={resolve(ROUTES.profile)} class="min-h-10 px-0 text-sm">
		Back to profile
	</Button>
	<h1 class="page-title">Two-factor authentication</h1>
	<p class="mt-4 max-w-md text-base text-muted">
		Two-factor authentication asks for a code from an authenticator app on your phone each time you
		sign in, as well as your password.
	</p>
</div>

<div class="mt-8 grid gap-8">
	{#if session.isSignedIn}
		<TwoFactorSettings />
	{/if}
</div>
