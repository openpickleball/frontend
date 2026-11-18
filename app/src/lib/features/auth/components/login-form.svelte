<script lang="ts">
	import { resolve } from '$app/paths';
	import { loginSchema } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		asAppError,
		focusFirstError,
		isThrottled,
		issueMessages,
		serverMessages
	} from '../forms.js';
	import { session } from '../session.svelte.js';
	import { login } from '../services.js';
	import Banner from './banner.svelte';
	import CheckEmail from './check-email.svelte';
	import TextField from './text-field.svelte';

	/** Called once the player is signed in. The page decides where they go next. */
	let { onsuccess }: { onsuccess: () => void } = $props();

	let email = $state('');
	let password = $state('');
	let errors = $state<Record<string, string>>({});
	/** A problem with the form as a whole, shown in a banner. */
	let problem = $state<{ title: string; detail?: string } | null>(null);
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		problem = null;
		const parsed = loginSchema.safeParse({ email, password });
		if (!parsed.success) {
			errors = issueMessages(parsed.error.issues);
			focusFirstError(errors, ['email', 'password'], 'login');
			return;
		}
		errors = {};
		busy = true;
		try {
			const state = await login(parsed.data);
			if (state.status === 'signed_in') onsuccess();
			// Pending verification: the store now says so, and the check-your-email view shows.
		} catch (cause) {
			const error = asAppError(cause);
			if (error.code === 'email_password_mismatch') {
				problem = {
					title: "That email and password don't match.",
					detail: 'Check both and try again, or reset your password.'
				};
			} else if (isThrottled(error)) {
				// Too many tries (a 429, or a 400 lockout): show the message the error carries.
				problem = { title: error.message };
			} else {
				const fields = serverMessages(error);
				if (fields.email || fields.password) {
					errors = fields;
					focusFirstError(errors, ['email', 'password'], 'login');
				} else {
					problem = { title: error.message };
				}
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if session.status === 'pending_verification'}
	<CheckEmail page="login" />
{:else}
	<section aria-labelledby="login-title" class="grid gap-5">
		<h1 id="login-title" class="page-title">Sign in</h1>
		{#if problem}
			<Banner kind="error" title={problem.title} detail={problem.detail} />
		{/if}
		<form method="post" onsubmit={submit} novalidate class="grid gap-5">
			<TextField
				id="login-email"
				name="email"
				label="Email"
				type="email"
				autocomplete="email"
				bind:value={email}
				error={errors.email}
			/>
			<div class="grid gap-2">
				<TextField
					id="login-password"
					name="password"
					label="Password"
					type="password"
					reveal
					autocomplete="current-password"
					bind:value={password}
					error={errors.password}
				/>
				<a
					href={resolve('/account/password/reset')}
					class="justify-self-start text-sm font-medium text-secondary underline underline-offset-4 hover:text-muted"
					>Forgot your password?</a
				>
			</div>
			<Button type="submit" disabled={busy} aria-busy={busy} class="w-full">
				{busy ? 'Signing in...' : 'Sign in'}
			</Button>
		</form>
		<p class="text-sm text-muted">
			New to OPEN?
			<a
				href={resolve('/account/signup')}
				class="font-semibold text-secondary underline underline-offset-4 hover:text-muted"
				>Create an account</a
			>
		</p>
	</section>
{/if}
