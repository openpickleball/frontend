<script lang="ts">
	import { untrack } from 'svelte';
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
	import {
		asAppError,
		issueMessages,
		parseMfaCode,
		serverMessages,
		type CodeKind
	} from '../forms.js';
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
	const form = createAuthForm('reauth', ['password', 'code']);

	// Each new request starts on its first method, with no errors. A call that joins an open
	// request keeps its id, so the player stays on the method and code they were using.
	let shownId: number | null = null;
	$effect(() => {
		const request = reauthPrompt.request;
		if (!request || request.id === shownId) return;
		shownId = request.id;
		untrack(() => {
			method = request.methods[0] ?? 'password';
			kind = 'totp';
			form.problem = null;
			form.showFields({});
		});
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
		reauthPrompt.code = '';
		form.showFields({});
	}

	type Answer = { method: 'password'; value: string } | { method: 'code'; value: string };
	type Parsed =
		| { success: true; data: Answer }
		| { success: false; error: { issues: { path: string[]; message: string }[] } };

	function parse(): Parsed {
		if (method === 'password') {
			if (reauthPrompt.password === '') {
				return {
					success: false,
					error: { issues: [{ path: ['password'], message: 'Enter your password.' }] }
				};
			}
			return { success: true, data: { method: 'password', value: reauthPrompt.password } };
		}
		const parsed = parseMfaCode(reauthPrompt.code, kind);
		if (!parsed.success) return parsed;
		return { success: true, data: { method: 'code', value: parsed.data.code } };
	}

	/** The request whose confirm is waiting for its answer. Only that request shows it. */
	let inFlight = $state<number | null>(null);
	const busy = $derived(inFlight !== null && inFlight === reauthPrompt.request?.id);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const id = reauthPrompt.request?.id;
		if (id === undefined || busy) return;
		form.problem = null;
		const parsed = parse();
		if (!parsed.success) {
			form.showFields(issueMessages(parsed.error.issues));
			return;
		}
		form.showFields({});
		inFlight = id;
		// An answer that comes back after this request closed belongs to nobody: drop it.
		const current = () => reauthPrompt.request?.id === id;
		try {
			const answer = parsed.data;
			if (answer.method === 'password') await reauthenticate(answer.value);
			else await reauthenticateMfa(answer.value);
			if (current()) reauthPrompt.settle(true);
		} catch (cause) {
			if (!current()) return;
			const error = asAppError(cause);
			const fields = serverMessages(error);
			if (fields.password || fields.code) form.showFields(fields);
			else form.problem = { title: error.message };
		} finally {
			if (inFlight === id) inFlight = null;
		}
	}

	function cancel() {
		if (reauthPrompt.request) reauthPrompt.settle(false);
	}
</script>

<!--
	Mounted only while a request is open. A bits-ui portal adds its place in body when it mounts,
	and dialogs of the same z-index stack in that order. The layout mounts before any page, so a
	prompt mounted with the layout would sit under a page's open dialog, such as the delete dialog
	after a client-side visit to Profile. Mounted on open, its portal comes last and stays on top.
-->
{#if reauthPrompt.request}
	<Dialog
		open
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
							bind:value={reauthPrompt.password}
							error={form.errors.password}
						/>
					{:else}
						<MfaCodeField
							id="reauth-code"
							{kind}
							bind:value={reauthPrompt.code}
							error={form.errors.code}
						/>
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
					<Button type="submit" aria-disabled={busy} aria-busy={busy}>
						{#if busy}<Spinner />{/if}
						{busy ? 'Checking…' : 'Confirm'}
					</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	</Dialog>
{/if}
