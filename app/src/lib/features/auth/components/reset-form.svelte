<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { PASSWORD_MIN_LENGTH, passwordResetSchema } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		asAppError,
		focusFirstError,
		isThrottled,
		issueMessages,
		serverMessages
	} from '../forms.js';
	import { checkResetKey, resetPassword } from '../services.js';
	import Banner from './banner.svelte';
	import TextField from './text-field.svelte';

	/** The key from the link in the email. */
	let { key }: { key: string } = $props();

	/** `checking` while we ask whether the link still works. `form` is the normal state. */
	let step = $state<'checking' | 'form' | 'invalid' | 'done'>('checking');
	let password = $state('');
	let errors = $state<Record<string, string>>({});
	let problem = $state<string | null>(null);
	let busy = $state(false);
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

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		problem = null;
		const parsed = passwordResetSchema.safeParse({ key, password });
		if (!parsed.success) {
			errors = issueMessages(parsed.error.issues);
			if (errors.key) show('invalid');
			else focusFirstError(errors, ['password'], 'newpw');
			return;
		}
		errors = {};
		busy = true;
		try {
			await resetPassword(parsed.data.key, parsed.data.password);
			show('done');
		} catch (cause) {
			const error = asAppError(cause);
			const fields = serverMessages(error);
			if (!isThrottled(error) && fields.key && !fields.password) {
				show('invalid');
			} else if (!isThrottled(error) && fields.password) {
				errors = fields;
				focusFirstError(errors, ['password'], 'newpw');
			} else {
				problem = error.message;
			}
		} finally {
			busy = false;
		}
	}
</script>

<section aria-labelledby="newpw-title" class="grid gap-5">
	{#if step === 'checking'}
		<h1 id="newpw-title" class="page-title">Choose a new password</h1>
		<p class="text-muted" role="status">Checking your link...</p>
	{:else if step === 'form'}
		<h1 id="newpw-title" class="page-title">Choose a new password</h1>
		{#if problem}
			<Banner kind="error" title={problem} />
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
				error={errors.password}
			/>
			<Button type="submit" aria-disabled={busy} aria-busy={busy} class="w-full">
				{busy ? 'Saving...' : 'Save new password'}
			</Button>
		</form>
	{:else if step === 'done'}
		<h1 id="newpw-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
			Password changed
		</h1>
		<Banner
			kind="success"
			title="Your password is changed."
			detail="Sign in with your new password."
		/>
		<Button href={resolve('/account/login')} class="w-full">Sign in</Button>
	{:else}
		<h1 id="newpw-title" bind:this={heading} tabindex="-1" class="page-title outline-none">
			This link doesn't work anymore
		</h1>
		<p class="text-muted">It may have expired or been used already. You can ask for a new one.</p>
		<Button href={resolve('/account/password/reset')} class="w-full">Send a new link</Button>
	{/if}
</section>
