<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { onMount } from 'svelte';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '#lib/ui/card/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { asAppError } from '../forms.js';
	import { verifyEmail } from '../services.js';

	/** The key from the link in the email. */
	let { key }: { key: string } = $props();

	let phase = $state<'working' | 'confirmed' | 'invalid' | 'failed'>('working');
	let failure = $state('');
	let heading = $state<HTMLElement | null>(null);

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

	// The title follows the heading, so the tab and the history entry name the view.
	const title = $derived(
		{
			working: 'Verify your email',
			confirmed: 'Email verified',
			invalid: "This link doesn't work anymore",
			failed: "We couldn't verify your email"
		}[phase]
	);
</script>

<svelte:head>
	<title>{title} · OPEN Pickleball</title>
</svelte:head>

<Card aria-labelledby="verify-title">
	{#if phase === 'working'}
		<CardHeader>
			<CardTitle level="h1" id="verify-title">Verify your email</CardTitle>
		</CardHeader>
		<CardContent>
			<LoadingState label="Verifying your email…" />
		</CardContent>
	{:else if phase === 'confirmed'}
		<CardHeader>
			<CardTitle level="h1" id="verify-title" bind:ref={heading} tabindex={-1} class="outline-none">
				Email verified
			</CardTitle>
			<CardDescription>Sign in to record your first match.</CardDescription>
		</CardHeader>
		<CardFooter>
			<Button href={resolve(ROUTES.login)} class="w-full">Sign in</Button>
		</CardFooter>
	{:else if phase === 'invalid'}
		<CardHeader>
			<CardTitle level="h1" id="verify-title" bind:ref={heading} tabindex={-1} class="outline-none">
				This link doesn't work anymore
			</CardTitle>
			<CardDescription>
				It may have expired or been used already. Sign in, and if your email still needs verifying,
				we'll send a new link.
			</CardDescription>
		</CardHeader>
		<CardFooter>
			<Button href={resolve(ROUTES.login)} class="w-full">Sign in</Button>
		</CardFooter>
	{:else}
		<CardHeader>
			<CardTitle level="h1" id="verify-title" bind:ref={heading} tabindex={-1} class="outline-none">
				We couldn't verify your email
			</CardTitle>
		</CardHeader>
		<CardContent>
			<Alert variant="destructive">
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>{failure}</AlertTitle>
			</Alert>
		</CardContent>
		<CardFooter>
			<Button variant="outline" onclick={confirm} class="w-full">Try again</Button>
		</CardFooter>
	{/if}
</Card>
