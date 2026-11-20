<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import { onMount } from 'svelte';
	import { PASSWORD_MIN_LENGTH, ROUTES, passwordResetSchema } from '#lib/domain/index.js';
	import { Alert, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { isThrottled } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { checkResetKey, resetPassword } from '../services.js';
	import TextField from './text-field.svelte';

	/** The key from the link in the email. */
	let { key }: { key: string } = $props();

	/** `checking` while we ask whether the link still works. `form` is the normal state. */
	let step = $state<'checking' | 'form' | 'invalid' | 'done'>('checking');
	let password = $state('');
	const form = createAuthForm('newpw', ['password']);
	let heading = $state<HTMLHeadingElement>();

	function show(next: typeof step) {
		step = next;
		queueMicrotask(() => heading?.focus());
	}

	onMount(async () => {
		try {
			step = (await checkResetKey(key)) ? 'form' : 'invalid';
		} catch {
			// Can't tell (no network, say). Show the form, and let the submit report the problem.
			step = 'form';
		}
	});

	function submit(event: SubmitEvent) {
		return form.submit(event, {
			parse: () => passwordResetSchema.safeParse({ key, password }),
			// A bad key shows the "link doesn't work" view, not a field.
			onInvalid: (messages) => {
				if (!messages.key) return false;
				show('invalid');
				return true;
			},
			run: async (data) => {
				await resetPassword(data.key, data.password);
				show('done');
			},
			onError: (error, fields) => {
				if (!isThrottled(error) && fields.key && !fields.password) {
					show('invalid');
				} else if (!isThrottled(error) && fields.password) {
					form.showFields(fields);
				} else {
					form.problem = { title: error.message };
				}
			}
		});
	}

	// The title follows the heading, so the tab and the history entry name the view.
	const title = $derived(
		{
			checking: 'Choose a new password',
			form: 'Choose a new password',
			done: 'Password changed',
			invalid: "This link doesn't work anymore"
		}[step]
	);
</script>

<svelte:head>
	<title>{title} · OPEN Pickleball</title>
</svelte:head>

<section aria-labelledby="newpw-title" class="grid gap-5">
	{#if step === 'checking'}
		<h1 id="newpw-title" class="page-title">Choose a new password</h1>
		<p class="text-muted" role="status">Checking your link…</p>
	{:else if step === 'form'}
		<h1 id="newpw-title" class="page-title">Choose a new password</h1>
		{#if form.problem}
			<Alert variant="destructive">
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>{form.problem.title}</AlertTitle>
			</Alert>
		{/if}
		<form method="post" onsubmit={submit} novalidate class="grid gap-5">
			<TextField
				id="newpw-password"
				name="password"
				label="New password"
				type="password"
				reveal
				autocomplete="new-password"
				hint="At least {PASSWORD_MIN_LENGTH} characters. Avoid one you use somewhere else."
				bind:value={password}
				error={form.errors.password}
			/>
			<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy} class="w-full">
				{form.busy ? 'Saving…' : 'Save new password'}
			</Button>
		</form>
	{:else if step === 'done'}
		<h1 id="newpw-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
			Password changed
		</h1>
		<Alert variant="success">
			<CircleCheckIcon aria-hidden="true" />
			<AlertTitle>Your password is changed.</AlertTitle>
			<AlertDescription>Sign in with your new password.</AlertDescription>
		</Alert>
		<Button href={resolve(ROUTES.login)} class="w-full">Sign in</Button>
	{:else}
		<h1 id="newpw-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
			This link doesn't work anymore
		</h1>
		<p class="text-muted">It may have expired or been used already. You can ask for a new one.</p>
		<Button href={resolve(ROUTES.passwordReset)} class="w-full">Send a new link</Button>
	{/if}
</section>
