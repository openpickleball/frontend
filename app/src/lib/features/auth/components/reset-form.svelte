<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { onMount } from 'svelte';
	import { PASSWORD_MIN_LENGTH, ROUTES, passwordResetSchema } from '#lib/domain/index.js';
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
	import { Spinner } from '#lib/ui/spinner/index.js';
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
	let heading = $state<HTMLElement | null>(null);

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

<Card aria-labelledby="newpw-title">
	{#if step === 'checking'}
		<CardHeader>
			<CardTitle level="h1" id="newpw-title">Choose a new password</CardTitle>
		</CardHeader>
		<CardContent>
			<LoadingState label="Checking your link…" />
		</CardContent>
	{:else if step === 'form'}
		<CardHeader>
			<CardTitle level="h1" id="newpw-title">Choose a new password</CardTitle>
			<CardDescription>Pick one you don't use anywhere else.</CardDescription>
		</CardHeader>
		<form method="post" onsubmit={submit} novalidate class="grid gap-8">
			<CardContent>
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
			</CardContent>
			<CardFooter>
				<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy} class="w-full">
					{#if form.busy}<Spinner />{/if}
					{form.busy ? 'Saving…' : 'Save new password'}
				</Button>
				<!-- Below the button, so an error doesn't push the form down and move the button. -->
				{#if form.problem}
					<Alert variant="destructive">
						<CircleAlertIcon aria-hidden="true" />
						<AlertTitle>{form.problem.title}</AlertTitle>
					</Alert>
				{/if}
			</CardFooter>
		</form>
	{:else if step === 'done'}
		<CardHeader>
			<CardTitle level="h1" id="newpw-title" bind:ref={heading} tabindex={-1} class="outline-none">
				Password changed
			</CardTitle>
			<CardDescription>Sign in with your new password.</CardDescription>
		</CardHeader>
		<CardFooter>
			<Button href={resolve(ROUTES.login)} class="w-full">Sign in</Button>
		</CardFooter>
	{:else}
		<CardHeader>
			<CardTitle level="h1" id="newpw-title" bind:ref={heading} tabindex={-1} class="outline-none">
				This link doesn't work anymore
			</CardTitle>
			<CardDescription>
				It may have expired or been used already. You can ask for a new one.
			</CardDescription>
		</CardHeader>
		<CardFooter>
			<Button href={resolve(ROUTES.passwordReset)} class="w-full">Send a new link</Button>
		</CardFooter>
	{/if}
</Card>
