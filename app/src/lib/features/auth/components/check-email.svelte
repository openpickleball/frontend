<script lang="ts">
	import { resolve } from '$app/paths';
	import MailIcon from '@lucide/svelte/icons/mail';
	import { ROUTES } from '#lib/domain/index.js';
	import { onMount } from 'svelte';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '#lib/ui/card/index.js';
	import { session } from '../session.svelte.js';

	let heading = $state<HTMLElement | null>(null);
	// Tell screen reader users the page changed.
	onMount(() => heading?.focus());
</script>

<Card aria-labelledby="check-title">
	<CardHeader>
		<MailIcon aria-hidden="true" class="size-10 text-muted" />
		<CardTitle level="h1" id="check-title" bind:ref={heading} tabindex={-1} class="outline-none"
			>Check your email</CardTitle
		>
		<CardDescription>
			{#if session.email}
				We sent a link to <strong class="font-semibold wrap-anywhere text-secondary"
					>{session.email}</strong
				>.
			{:else}
				We sent a link to your email address.
			{/if}
			Open it to verify your email, then sign in.
		</CardDescription>
	</CardHeader>
	<CardContent>
		<p class="text-sm text-faint">Nothing there after a few minutes? Check your spam folder.</p>
		<!--
			Not a resend button: this backend confirms by link, and its resend call always fails.
			Signing in again with the same email sends a new link, so that is what we point to.
		-->
		<p class="text-sm text-faint">
			Still no link, or it stopped working? Sign in again with the same email and password, and we
			will send a new one.
		</p>
	</CardContent>
	<CardFooter>
		<!-- The sign-in page keeps the pending notice above its form, so nothing is cleared here. -->
		<Button variant="outline" href={resolve(ROUTES.login)} class="w-full">Go to sign in</Button>
		<p class="flex flex-wrap items-center gap-x-1 text-sm text-muted">
			Wrong address?
			<Button variant="link" class="min-h-10 px-0 text-sm" onclick={() => session.clearPending()}
				>Start over</Button
			>
		</p>
	</CardFooter>
</Card>
