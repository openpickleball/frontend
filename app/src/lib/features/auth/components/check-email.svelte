<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { Button } from '#lib/ui/button/index.js';
	import { session } from '../session.svelte.js';

	/** Which page this is on. "Sign in again" goes to the sign-in page from sign-up. */
	let { page }: { page: 'login' | 'signup' } = $props();

	let heading = $state<HTMLHeadingElement>();
	// Tell screen reader users the page changed.
	onMount(() => heading?.focus());

	function signInAgain() {
		session.clearPending();
		if (page === 'signup') void goto(resolve('/account/login'));
	}
</script>

<section aria-labelledby="check-title" class="grid gap-4">
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.25"
		stroke-linejoin="round"
		aria-hidden="true"
		class="size-10 text-muted"
	>
		<rect x="3" y="5.5" width="18" height="13" rx="1.5" />
		<path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
	</svg>
	<h1 id="check-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
		Check your email
	</h1>
	<p class="text-muted">
		{#if session.email}
			We sent a link to <strong class="font-semibold text-secondary">{session.email}</strong>.
		{:else}
			We sent a link to your email address.
		{/if}
		Open it to confirm your address, then sign in.
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
		<Button variant="outline" onclick={signInAgain}>Sign in for a new link</Button>
	</div>
	<p class="text-sm text-muted">
		Wrong address?
		{#if page === 'signup'}
			<button
				type="button"
				class="font-semibold text-secondary underline underline-offset-4 hover:text-muted"
				onclick={() => session.clearPending()}>Start over</button
			>
		{:else}
			<a
				href={resolve('/account/signup')}
				class="font-semibold text-secondary underline underline-offset-4 hover:text-muted"
				onclick={() => session.clearPending()}>Start over</a
			>
		{/if}
	</p>
</section>
