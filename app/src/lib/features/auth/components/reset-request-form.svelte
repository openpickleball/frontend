<script lang="ts">
	import { resolve } from '$app/paths';
	import { passwordResetRequestSchema } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		asAppError,
		focusFirstError,
		isThrottled,
		issueMessages,
		serverMessages
	} from '../forms.js';
	import { requestPasswordReset } from '../services.js';
	import Banner from './banner.svelte';
	import TextField from './text-field.svelte';

	let email = $state('');
	let errors = $state<Record<string, string>>({});
	let problem = $state<string | null>(null);
	let busy = $state(false);
	/** The address we asked for a link to, once the request went through. */
	let sentTo = $state<string | null>(null);
	let heading = $state<HTMLHeadingElement>();

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		problem = null;
		const parsed = passwordResetRequestSchema.safeParse({ email });
		if (!parsed.success) {
			errors = issueMessages(parsed.error.issues);
			focusFirstError(errors, ['email'], 'reset');
			return;
		}
		errors = {};
		busy = true;
		try {
			await requestPasswordReset(parsed.data.email);
			sentTo = parsed.data.email;
			queueMicrotask(() => heading?.focus());
		} catch (cause) {
			const error = asAppError(cause);
			const fields = serverMessages(error);
			if (!isThrottled(error) && fields.email) {
				errors = fields;
				focusFirstError(errors, ['email'], 'reset');
			} else {
				problem = error.message;
			}
		} finally {
			busy = false;
		}
	}
</script>

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
			<Button variant="outline" href={resolve('/account/login')}>Back to sign in</Button>
		</div>
	</section>
{:else}
	<section aria-labelledby="reset-title" class="grid gap-5">
		<h1 id="reset-title" class="page-title">Reset your password</h1>
		<p class="text-muted">Enter your email and we'll send you a link to choose a new password.</p>
		{#if problem}
			<Banner kind="error" title={problem} />
		{/if}
		<form method="post" onsubmit={submit} novalidate class="grid gap-5">
			<TextField
				id="reset-email"
				name="email"
				label="Email"
				type="email"
				autocomplete="email"
				bind:value={email}
				error={errors.email}
			/>
			<Button type="submit" disabled={busy} aria-busy={busy} class="w-full">
				{busy ? 'Sending...' : 'Send reset link'}
			</Button>
		</form>
		<p class="text-sm text-muted">
			<a
				href={resolve('/account/login')}
				class="font-semibold text-secondary underline underline-offset-4 hover:text-muted"
				>Back to sign in</a
			>
		</p>
	</section>
{/if}
