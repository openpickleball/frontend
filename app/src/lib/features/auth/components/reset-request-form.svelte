<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { ROUTES, passwordResetRequestSchema } from '#lib/domain/index.js';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { isThrottled } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { requestPasswordReset } from '../services.js';
	import TextField from './text-field.svelte';

	let email = $state('');
	const form = createAuthForm('reset', ['email']);
	/** The address we asked for a link to, once the request went through. */
	let sentTo = $state<string | null>(null);
	let heading = $state<HTMLHeadingElement>();

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
	<section aria-labelledby="reset-title" class="grid gap-4">
		<h1 id="reset-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
			Check your email
		</h1>
		<!-- The same words whether or not an account uses this address. -->
		<p class="text-muted">
			If an account uses <strong class="font-semibold text-secondary">{sentTo}</strong>, we sent a
			link to choose a new password.
		</p>
		<p class="text-sm text-faint">Nothing there after a few minutes? Check your spam folder.</p>
		<div class="mt-2">
			<Button variant="outline" href={resolve(ROUTES.login)} class="w-full">Back to sign in</Button>
		</div>
	</section>
{:else}
	<section aria-labelledby="reset-title" class="grid gap-5">
		<h1 id="reset-title" class="page-title">Reset your password</h1>
		<p class="text-muted">Enter your email and we'll send you a link to choose a new password.</p>
		{#if form.problem}
			<Alert variant="destructive">
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>{form.problem.title}</AlertTitle>
			</Alert>
		{/if}
		<form method="post" onsubmit={submit} novalidate class="grid gap-5">
			<TextField
				id="reset-email"
				name="email"
				label="Email"
				type="email"
				autocomplete="email"
				bind:value={email}
				error={form.errors.email}
			/>
			<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy} class="w-full">
				{#if form.busy}<Spinner />{/if}
				{form.busy ? 'Sending…' : 'Send reset link'}
			</Button>
		</form>
		<p class="text-sm text-muted">
			<a
				href={resolve(ROUTES.login)}
				class="font-semibold text-secondary underline underline-offset-4 hover:text-muted"
				>Back to sign in</a
			>
		</p>
	</section>
{/if}
