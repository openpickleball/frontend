<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
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
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { isThrottled, parseMfaCode, type CodeKind } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { session } from '../session.svelte.js';
	import { authenticateMfa, cancelMfa } from '../services.js';
	import MfaCodeField from './mfa-code-field.svelte';

	/** Called once the player is signed in. The page decides where they go next. */
	let { onsuccess }: { onsuccess: () => void } = $props();

	let code = $state('');
	let kind = $state<CodeKind>('totp');
	let leaving = $state(false);
	const form = createAuthForm('mfa', ['code']);
	const offersRecovery = $derived(session.mfaTypes.includes('recovery_codes'));

	function toggle() {
		kind = kind === 'totp' ? 'recovery' : 'totp';
		code = '';
		form.showFields({});
	}

	function submit(event: SubmitEvent) {
		// One action at a time: no code check while starting over.
		if (leaving) {
			event.preventDefault();
			return;
		}
		return form.submit(event, {
			parse: () => parseMfaCode(code, kind),
			run: async (data) => {
				const state = await authenticateMfa(data.code);
				if (state.status === 'signed_in') onsuccess();
			},
			onError: (error, fields) => {
				if (fields.code) form.showFields(fields);
				else if (isThrottled(error)) form.problem = { title: error.message };
				else form.problem = { title: "We couldn't check your code.", detail: error.message };
			}
		});
	}

	async function startOver() {
		// One action at a time: no start over while a code is being checked.
		if (leaving || form.busy) return;
		leaving = true;
		try {
			await cancelMfa();
		} catch {
			// The store is signed out either way, so the password form shows.
		} finally {
			leaving = false;
		}
	}
</script>

<Card aria-labelledby="mfa-title">
	<CardHeader>
		<CardTitle level="h1" id="mfa-title">Enter your code</CardTitle>
		<CardDescription>
			{#if kind === 'totp'}
				Open your authenticator app and enter the 6-digit code for OPEN.
			{:else}
				Enter one of the recovery codes you saved. Each one works once.
			{/if}
		</CardDescription>
	</CardHeader>
	<form method="post" onsubmit={submit} novalidate class="grid gap-8">
		<CardContent>
			<div class="grid gap-2">
				<MfaCodeField id="mfa-code" {kind} bind:value={code} error={form.errors.code} />
				{#if offersRecovery}
					<Button variant="link" onclick={toggle} class="min-h-10 justify-self-start px-0 text-sm">
						{kind === 'totp' ? 'Use a recovery code' : 'Use your authenticator app'}
					</Button>
				{/if}
			</div>
		</CardContent>
		<CardFooter>
			<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy} class="w-full">
				{#if form.busy}<Spinner />{/if}
				{form.busy ? 'Checking…' : 'Continue'}
			</Button>
			{#if form.problem}
				<Alert variant="destructive">
					<CircleAlertIcon aria-hidden="true" />
					<AlertTitle>{form.problem.title}</AlertTitle>
					{#if form.problem.detail}
						<AlertDescription>{form.problem.detail}</AlertDescription>
					{/if}
				</Alert>
			{/if}
			<Button
				variant="link"
				onclick={startOver}
				aria-disabled={leaving}
				class="min-h-10 justify-self-start px-0 text-sm"
			>
				Start over
			</Button>
		</CardFooter>
	</form>
</Card>
