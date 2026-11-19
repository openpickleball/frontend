<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import { onMount } from 'svelte';
	import { Alert, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { asAppError } from '../forms.js';
	import { verifyEmail } from '../services.js';

	/** The key from the link in the email. */
	let { key }: { key: string } = $props();

	let phase = $state<'working' | 'confirmed' | 'invalid' | 'failed'>('working');
	let failure = $state('');
	let heading = $state<HTMLHeadingElement>();

	async function confirm() {
		phase = 'working';
		try {
			await verifyEmail(key);
			phase = 'confirmed';
		} catch (cause) {
			const error = asAppError(cause);
			// A bad key shows up as a 400 on `key`. Anything else (no network) can be tried again.
			if (error.status === 400 || error.status === 404 || error.status === 410) {
				phase = 'invalid';
			} else {
				failure = error.message;
				phase = 'failed';
			}
		}
		// Move focus to the result for screen reader users.
		queueMicrotask(() => heading?.focus());
	}

	// Opening the link is the confirmation. A mail scanner that only fetches the page
	// doesn't run this, so it can't use up the key.
	onMount(() => {
		void confirm();
	});
</script>

<section aria-labelledby="verify-title" class="grid gap-5">
	{#if phase === 'working'}
		<h1 id="verify-title" class="page-title">Verify your email</h1>
		<p class="text-muted" role="status">Confirming your email...</p>
	{:else if phase === 'confirmed'}
		<h1 id="verify-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
			Email confirmed
		</h1>
		<Alert variant="success">
			<CircleCheckIcon aria-hidden="true" />
			<AlertTitle>Your email is confirmed.</AlertTitle>
			<AlertDescription>Sign in to record your first match.</AlertDescription>
		</Alert>
		<Button href={resolve('/account/login')} class="w-full">Sign in</Button>
	{:else if phase === 'invalid'}
		<h1 id="verify-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
			This link doesn't work anymore
		</h1>
		<p class="text-muted">
			It may have expired or been used already. Sign in, and if your email still needs confirming,
			we'll send a new link.
		</p>
		<Button href={resolve('/account/login')} class="w-full">Sign in</Button>
	{:else}
		<h1 id="verify-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
			We couldn't confirm your email
		</h1>
		<Alert variant="destructive">
			<CircleAlertIcon aria-hidden="true" />
			<AlertTitle>{failure}</AlertTitle>
		</Alert>
		<Button variant="outline" onclick={confirm} class="w-full">Try again</Button>
	{/if}
</section>
