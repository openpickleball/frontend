<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { PASSWORD_MIN_LENGTH, ROUTES, signupSchema } from '#lib/domain/index.js';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { isThrottled } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { session } from '../session.svelte.js';
	import { signup } from '../services.js';
	import CheckEmail from './check-email.svelte';
	import TextField from './text-field.svelte';

	/** Called if the backend signs the player in straight away. Normally they check their email. */
	let { onsuccess }: { onsuccess: () => void } = $props();

	let email = $state('');
	let password = $state('');
	const form = createAuthForm('signup', ['email', 'password']);

	function submit(event: SubmitEvent) {
		return form.submit(event, {
			parse: () => signupSchema.safeParse({ email, password }),
			run: async (data) => {
				// A new address and one that already has an account get the same answer, so the
				// screen never says which it was.
				const state = await signup(data);
				if (state.status === 'signed_in') onsuccess();
			},
			onError: (error, fields) => {
				if (!isThrottled(error) && (fields.email || fields.password)) {
					form.showFields(fields);
				} else {
					form.problem = { title: error.message };
				}
			}
		});
	}

	// The title follows the heading, so the tab and the history entry name the view.
	const title = $derived(
		session.status === 'pending_verification' ? 'Check your email' : 'Create account'
	);
</script>

<svelte:head>
	<title>{title} · OPEN Pickleball</title>
</svelte:head>

{#if session.status === 'pending_verification'}
	<CheckEmail />
{:else}
	<section aria-labelledby="signup-title" class="grid gap-4">
		<h1 id="signup-title" class="page-title">Create account</h1>
		<p class="text-muted">It's free. We'll send you a link to verify your email.</p>
		{#if form.problem}
			<Alert variant="destructive">
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>{form.problem.title}</AlertTitle>
			</Alert>
		{/if}
		<form method="post" onsubmit={submit} novalidate class="grid gap-4">
			<TextField
				id="signup-email"
				name="email"
				label="Email"
				type="email"
				autocomplete="email"
				placeholder="you@example.com"
				bind:value={email}
				error={form.errors.email}
			/>
			<TextField
				id="signup-password"
				name="password"
				label="Password"
				type="password"
				reveal
				autocomplete="new-password"
				hint="At least {PASSWORD_MIN_LENGTH} characters. Avoid one you use somewhere else."
				bind:value={password}
				error={form.errors.password}
			/>
			<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy} class="w-full">
				{#if form.busy}<Spinner />{/if}
				{form.busy ? 'Creating account…' : 'Create account'}
			</Button>
		</form>
		<p class="text-sm text-muted">
			Already have an account?
			<a
				href={resolve(ROUTES.login)}
				class="font-semibold text-secondary underline underline-offset-4 hover:text-muted"
				>Sign in</a
			>
		</p>
	</section>
{/if}
