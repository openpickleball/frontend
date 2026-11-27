<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import type { ReauthMethod } from '#lib/api/index.js';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '#lib/ui/dialog/index.js';
	import { TextField } from '#lib/ui/field/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { parseMfaCode, type CodeKind } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { reauthPrompt } from '../reauth.svelte.js';
	import { reauthenticate, reauthenticateMfa } from '../services.js';
	import MfaCodeField from './mfa-code-field.svelte';

	/**
	 * The one reauthentication prompt, mounted in the root layout. It opens when a call asks for a
	 * reauthentication (`withReauth`), with the password or a code as the backend offers, and
	 * closes with the answer.
	 */
	const methods = $derived(reauthPrompt.request?.methods ?? []);
	const offersRecovery = $derived(
		reauthPrompt.request?.codeTypes.includes('recovery_codes') ?? false
	);
	let method = $state<ReauthMethod>('password');
	let kind = $state<CodeKind>('totp');
	let password = $state('');
	let code = $state('');
	const form = createAuthForm('reauth', ['password', 'code']);

	// Each request starts on its first method, with empty fields.
	$effect(() => {
		const request = reauthPrompt.request;
		if (!request) return;
		method = request.methods[0] ?? 'password';
		kind = 'totp';
		password = '';
		code = '';
		form.problem = null;
		form.showFields({});
	});

	function focusField(event: Event) {
		event.preventDefault();
		document.getElementById(method === 'password' ? 'reauth-password' : 'reauth-code')?.focus();
	}

	function useMethod(next: ReauthMethod) {
		method = next;
		form.problem = null;
		form.showFields({});
		queueMicrotask(() =>
			document.getElementById(next === 'password' ? 'reauth-password' : 'reauth-code')?.focus()
		);
	}

	function toggleKind() {
		kind = kind === 'totp' ? 'recovery' : 'totp';
		code = '';
		form.showFields({});
	}

	type Answer = { method: 'password'; value: string } | { method: 'code'; value: string };
	type Parsed =
		| { success: true; data: Answer }
		| { success: false; error: { issues: { path: string[]; message: string }[] } };

	function parse(): Parsed {
		if (method === 'password') {
			if (password === '') {
				return {
					success: false,
					error: { issues: [{ path: ['password'], message: 'Enter your password.' }] }
				};
			}
			return { success: true, data: { method: 'password', value: password } };
		}
		const parsed = parseMfaCode(code, kind);
		if (!parsed.success) return parsed;
		return { success: true, data: { method: 'code', value: parsed.data.code } };
	}

	function submit(event: SubmitEvent) {
		return form.submit(event, {
			parse,
			run: async (answer) => {
				if (answer.method === 'password') await reauthenticate(answer.value);
				else await reauthenticateMfa(answer.value);
				reauthPrompt.settle(true);
			},
			onError: (error, fields) => {
				if (fields.password || fields.code) form.showFields(fields);
				else form.problem = { title: error.message };
			}
		});
	}

	function cancel() {
		if (reauthPrompt.request) reauthPrompt.settle(false);
	}
</script>

<Dialog
	open={reauthPrompt.request !== null}
	onOpenChange={(open) => {
		if (!open) cancel();
	}}
>
	<DialogContent onOpenAutoFocus={focusField}>
		<form method="post" onsubmit={submit} novalidate class="grid gap-8">
			<DialogHeader>
				<DialogTitle>Confirm it's you</DialogTitle>
				<DialogDescription>
					{#if method === 'password'}
						Enter your password to continue.
					{:else if kind === 'totp'}
						Enter the 6-digit code from your authenticator app to continue.
					{:else}
						Enter one of your recovery codes to continue. Each one works once.
					{/if}
				</DialogDescription>
			</DialogHeader>
			<div class="grid gap-2">
				{#if method === 'password'}
					<TextField
						id="reauth-password"
						name="password"
						label="Password"
						type="password"
						reveal
						autocomplete="current-password"
						bind:value={password}
						error={form.errors.password}
					/>
				{:else}
					<MfaCodeField id="reauth-code" {kind} bind:value={code} error={form.errors.code} />
					{#if offersRecovery}
						<Button
							variant="link"
							onclick={toggleKind}
							class="min-h-10 justify-self-start px-0 text-sm"
						>
							{kind === 'totp' ? 'Use a recovery code' : 'Use your authenticator app'}
						</Button>
					{/if}
				{/if}
				{#if methods.includes('password') && methods.includes('code')}
					<Button
						variant="link"
						onclick={() => useMethod(method === 'password' ? 'code' : 'password')}
						class="min-h-10 justify-self-start px-0 text-sm"
					>
						{method === 'password' ? 'Use a code instead' : 'Use your password instead'}
					</Button>
				{/if}
			</div>
			{#if form.problem}
				<Alert variant="destructive">
					<CircleAlertIcon aria-hidden="true" />
					<AlertTitle>{form.problem.title}</AlertTitle>
				</Alert>
			{/if}
			<DialogFooter>
				<Button variant="outline" onclick={cancel}>Cancel</Button>
				<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy}>
					{#if form.busy}<Spinner />{/if}
					{form.busy ? 'Checking…' : 'Confirm'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
