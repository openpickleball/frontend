<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import MailIcon from '@lucide/svelte/icons/mail';
	import { ROUTES, loginSchema } from '#lib/domain/index.js';
	import { Alert, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '#lib/ui/card/index.js';
	import { TextField } from '#lib/ui/field/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { isThrottled } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { session } from '../session.svelte.js';
	import { login } from '../services.js';
	import MfaCodeForm from './mfa-code-form.svelte';
	import SessionCheck from './session-check.svelte';

	/** Called once the player is signed in. The page decides where they go next. */
	let { onsuccess }: { onsuccess: () => void } = $props();

	let email = $state('');
	let password = $state('');
	const form = createAuthForm('login', ['email', 'password']);

	function submit(event: SubmitEvent) {
		return form.submit(event, {
			parse: () => loginSchema.safeParse({ email, password }),
			run: async (data) => {
				const state = await login(data);
				if (state.status === 'signed_in') onsuccess();
				// Pending verification or two-factor: the store now says so, and the next view shows.
			},
			onError: (error, fields) => {
				if (error.code === 'email_password_mismatch') {
					form.problem = {
						title: "That email and password don't match.",
						detail: 'Check both and try again, or reset your password.'
					};
				} else if (isThrottled(error)) {
					// Too many tries (a 429, or a 400 lockout): show the message the error carries.
					form.problem = { title: error.message };
				} else if (fields.email || fields.password) {
					form.showFields(fields);
				} else {
					// No field to mark, so say what happened to the sign-in as a whole.
					form.problem = { title: "We couldn't sign you in.", detail: error.message };
				}
			}
		});
	}
</script>

{#if session.status === 'pending_mfa'}
	<!-- The password was right and the account has two-factor: the code comes next. -->
	<MfaCodeForm {onsuccess} />
{:else}
	<Card aria-labelledby="login-title">
		<CardHeader>
			<CardTitle level="h1" id="login-title">Sign in</CardTitle>
			<CardDescription>Sign in to record matches and see your history.</CardDescription>
		</CardHeader>
		<form method="post" onsubmit={submit} novalidate class="grid gap-8">
			<CardContent>
				<!-- When the session could not be read, say so instead of a bare form that looks signed out. -->
				<SessionCheck onsignedin={onsuccess} />
				{#if session.status === 'pending_verification'}
					<!-- A sign-up is waiting on its link. The form stays, for a player with another account. -->
					<Alert>
						<MailIcon aria-hidden="true" />
						<AlertTitle>Check your email</AlertTitle>
						<AlertDescription>
							{#if session.email}
								We sent a link to <strong class="font-semibold wrap-anywhere">
									{session.email}
								</strong>.
							{:else}
								We sent a link to your email address.
							{/if}
							Open it to verify your email, then sign in below. Signing in again with the same email sends
							a new link.
						</AlertDescription>
					</Alert>
				{/if}
				{#if session.mfaTimedOut}
					<Alert variant="destructive">
						<CircleAlertIcon aria-hidden="true" />
						<AlertTitle>That took too long. Sign in again.</AlertTitle>
						<AlertDescription>Your sign-in waited too long for its code.</AlertDescription>
					</Alert>
				{/if}
				{#if session.expired}
					<Alert variant="destructive">
						<CircleAlertIcon aria-hidden="true" />
						<AlertTitle>You were signed out.</AlertTitle>
						<AlertDescription>Your session ended. Sign in again to continue.</AlertDescription>
					</Alert>
				{/if}
				<TextField
					id="login-email"
					name="email"
					label="Email"
					type="email"
					autocomplete="email"
					bind:value={email}
					error={form.errors.email}
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
						error={form.errors.password}
					/>
					<Button
						variant="link"
						href={resolve(ROUTES.passwordReset)}
						class="min-h-10 justify-self-start px-0 text-sm"
					>
						Forgot your password?
					</Button>
				</div>
			</CardContent>
			<CardFooter>
				<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy} class="w-full">
					{#if form.busy}<Spinner />{/if}
					{form.busy ? 'Signing in…' : 'Sign in'}
				</Button>
				<!-- Below the button, so an error doesn't push the form down and move the button. -->
				{#if form.problem}
					<Alert variant="destructive">
						<CircleAlertIcon aria-hidden="true" />
						<AlertTitle>{form.problem.title}</AlertTitle>
						{#if form.problem.detail}
							<AlertDescription>{form.problem.detail}</AlertDescription>
						{/if}
					</Alert>
				{/if}
				<p class="flex flex-wrap items-center gap-x-1 text-sm text-muted">
					New to OPEN?
					<Button variant="link" href={resolve(ROUTES.signup)} class="min-h-10 px-0 text-sm">
						Create account
					</Button>
				</p>
			</CardFooter>
		</form>
	</Card>
{/if}
