<script lang="ts">
	import { resolve } from '$app/paths';
	import { PASSWORD_MIN_LENGTH, signupSchema } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		asAppError,
		focusFirstError,
		isThrottled,
		issueMessages,
		serverMessages
	} from '../forms.js';
	import { session } from '../session.svelte.js';
	import { signup } from '../services.js';
	import Banner from './banner.svelte';
	import CheckEmail from './check-email.svelte';
	import TextField from './text-field.svelte';

	/** Called if the backend signs the player in straight away. Normally they check their email. */
	let { onsuccess }: { onsuccess: () => void } = $props();

	let email = $state('');
	let password = $state('');
	let errors = $state<Record<string, string>>({});
	let problem = $state<string | null>(null);
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		problem = null;
		const parsed = signupSchema.safeParse({ email, password });
		if (!parsed.success) {
			errors = issueMessages(parsed.error.issues);
			focusFirstError(errors, ['email', 'password'], 'signup');
			return;
		}
		errors = {};
		busy = true;
		try {
			// A new address and one that already has an account get the same answer, so the
			// screen never says which it was.
			const state = await signup(parsed.data);
			if (state.status === 'signed_in') onsuccess();
		} catch (cause) {
			const error = asAppError(cause);
			const fields = serverMessages(error);
			if (!isThrottled(error) && (fields.email || fields.password)) {
				errors = fields;
				focusFirstError(errors, ['email', 'password'], 'signup');
			} else {
				problem = error.message;
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if session.status === 'pending_verification'}
	<CheckEmail page="signup" />
{:else}
	<section aria-labelledby="signup-title" class="grid gap-5">
		<h1 id="signup-title" class="page-title">Create account</h1>
		<p class="text-muted">It's free. We'll send you an email to confirm your address.</p>
		{#if problem}
			<Banner kind="error" title={problem} />
		{/if}
		<form onsubmit={submit} novalidate class="grid gap-5">
			<TextField
				id="signup-email"
				name="email"
				label="Email"
				type="email"
				autocomplete="email"
				placeholder="you@example.com"
				bind:value={email}
				error={errors.email}
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
				error={errors.password}
			/>
			<Button type="submit" disabled={busy} aria-busy={busy} class="w-full">
				{busy ? 'Creating account...' : 'Create account'}
			</Button>
		</form>
		<p class="text-sm text-muted">
			Already have an account?
			<a
				href={resolve('/account/login')}
				class="font-semibold text-secondary underline underline-offset-4 hover:text-muted"
				>Sign in</a
			>
		</p>
	</section>
{/if}
