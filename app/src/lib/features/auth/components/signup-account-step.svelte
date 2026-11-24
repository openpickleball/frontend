<script lang="ts">
	import { resolve } from '$app/paths';
	import { PASSWORD_MIN_LENGTH, ROUTES } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '#lib/ui/card/index.js';
	import type { SignupValues } from './signup-details-step.svelte';
	import TextField from './text-field.svelte';

	let {
		values = $bindable(),
		errors,
		oncontinue
	}: {
		values: SignupValues;
		/** A message per field name. */
		errors: Record<string, string>;
		/** The form was sent: check these fields and move on. */
		oncontinue: (event: SubmitEvent) => void;
	} = $props();
</script>

<!-- Screen 1 of sign-up: the account. Nothing is sent from here. -->
<CardHeader>
	<div class="grid gap-1">
		<p class="text-sm text-muted">Step 1 of 2</p>
		<CardTitle level="h1" id="signup-title" tabindex={-1} class="outline-none">
			Create account
		</CardTitle>
	</div>
	<CardDescription>It's free. We'll send you a link to verify your email.</CardDescription>
</CardHeader>
<form method="post" onsubmit={oncontinue} novalidate class="grid gap-8">
	<CardContent>
		<TextField
			id="signup-email"
			name="email"
			label="Email"
			type="email"
			autocomplete="email"
			placeholder="you@example.com"
			bind:value={values.email}
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
			bind:value={values.password}
			error={errors.password}
		/>
		<TextField
			id="signup-password_confirm"
			name="password_confirm"
			label="Confirm password"
			type="password"
			reveal
			autocomplete="new-password"
			bind:value={values.password_confirm}
			error={errors.password_confirm}
		/>
	</CardContent>
	<CardFooter>
		<Button type="submit" class="w-full">Continue</Button>
		<p class="flex flex-wrap items-center gap-x-1 text-sm text-muted">
			Already have an account?
			<Button variant="link" href={resolve(ROUTES.login)} class="min-h-10 px-0 text-sm">
				Sign in
			</Button>
		</p>
	</CardFooter>
</form>
