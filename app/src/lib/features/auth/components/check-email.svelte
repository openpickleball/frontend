<script lang="ts">
	import { resolve } from '$app/paths';
	import MailIcon from '@lucide/svelte/icons/mail';
	import { ROUTES } from '#lib/domain/index.js';
	import { onMount } from 'svelte';
	import { Button } from '#lib/ui/button/index.js';
	import { session } from '../session.svelte.js';

	let heading = $state<HTMLHeadingElement>();
	// Tell screen reader users the page changed.
	onMount(() => heading?.focus());
</script>

<section aria-labelledby="check-title" class="grid gap-4">
	<MailIcon aria-hidden="true" class="size-10 text-muted" />
	<h1 id="check-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
		Check your email
	</h1>
	<p class="text-muted">
		{#if session.email}
			We sent a link to <strong class="font-semibold wrap-anywhere text-secondary"
				>{session.email}</strong
			>.
		{:else}
			We sent a link to your email address.
		{/if}
		Open it to verify your email, then sign in.
	</p>
	<p class="text-sm text-faint">Nothing there after a few minutes? Check your spam folder.</p>
	<!--
		Not a resend button: this backend confirms by link, and its resend call always fails.
		Signing in again with the same email sends a new link, so that is what we point to.
	-->
	<p class="text-sm text-faint">
		Still no link, or it stopped working? Sign in again with the same email and password, and we
		will send a new one.
	</p>
	<div class="mt-2 flex flex-wrap gap-3">
		<!-- The sign-in page keeps the pending notice above its form, so nothing is cleared here. -->
		<Button variant="outline" href={resolve(ROUTES.login)} class="w-full">Go to sign in</Button>
	</div>
	<p class="text-sm text-muted">
		Wrong address?
		<button
			type="button"
			class="font-semibold text-secondary underline underline-offset-4 hover:text-muted"
			onclick={() => session.clearPending()}>Start over</button
		>
	</p>
</section>
