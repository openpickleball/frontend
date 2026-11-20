<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { ROUTES, passwordResetRequestSchema } from '#lib/domain/index.js';
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
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { isThrottled } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { requestPasswordReset } from '../services.js';
	import TextField from './text-field.svelte';

	let email = $state('');
	const form = createAuthForm('reset', ['email']);
	/** The address we asked for a link to, once the request went through. */
	let sentTo = $state<string | null>(null);
	let heading = $state<HTMLElement | null>(null);

	function submit(event: SubmitEvent) {
		return form.submit(event, {
			parse: () => passwordResetRequestSchema.safeParse({ email }),
			run: async (data) => {
				await requestPasswordReset(data.email);
				sentTo = data.email;
				queueMicrotask(() => heading?.focus());
			},
			onError: (error, fields) => {
				if (!isThrottled(error) && fields.email) {
					form.showFields(fields);
				} else {
					form.problem = { title: error.message };
				}
			}
		});
	}

	// The title follows the heading, so the tab and the history entry name the view.
	const title = $derived(sentTo ? 'Check your email' : 'Reset your password');
</script>

<svelte:head>
	<title>{title} · OPEN Pickleball</title>
</svelte:head>

{#if sentTo}
	<Card aria-labelledby="reset-title">
		<CardHeader>
			<CardTitle level="h1" id="reset-title" bind:ref={heading} tabindex={-1} class="outline-none"
				>Check your email</CardTitle
			>
			<!-- The same words whether or not an account uses this address. -->
			<CardDescription>
				If an account uses <strong class="font-semibold text-secondary">{sentTo}</strong>, we sent a
				link to choose a new password.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<p class="text-sm text-faint">Nothing there after a few minutes? Check your spam folder.</p>
		</CardContent>
		<CardFooter>
			<Button variant="outline" href={resolve(ROUTES.login)} class="w-full">Back to sign in</Button>
		</CardFooter>
	</Card>
{:else}
	<Card aria-labelledby="reset-title">
		<CardHeader>
			<CardTitle level="h1" id="reset-title">Reset your password</CardTitle>
			<CardDescription>
				Enter your email and we'll send you a link to choose a new password.
			</CardDescription>
		</CardHeader>
		<form method="post" onsubmit={submit} novalidate class="grid gap-8">
			<CardContent>
				<TextField
					id="reset-email"
					name="email"
					label="Email"
					type="email"
					autocomplete="email"
					bind:value={email}
					error={form.errors.email}
				/>
			</CardContent>
			<CardFooter>
				<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy} class="w-full">
					{#if form.busy}<Spinner />{/if}
					{form.busy ? 'Sending…' : 'Send reset link'}
				</Button>
				<!-- Below the button, so an error doesn't push the form down and move the button. -->
				{#if form.problem}
					<Alert variant="destructive">
						<CircleAlertIcon aria-hidden="true" />
						<AlertTitle>{form.problem.title}</AlertTitle>
					</Alert>
				{/if}
				<Button
					variant="link"
					href={resolve(ROUTES.login)}
					class="min-h-10 justify-self-start px-0 text-sm">Back to sign in</Button
				>
			</CardFooter>
		</form>
	</Card>
{/if}
