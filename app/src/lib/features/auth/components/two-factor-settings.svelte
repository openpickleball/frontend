<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { onMount } from 'svelte';
	import { isAppError } from '#lib/api/index.js';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '#lib/ui/alert-dialog/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { asAppError, parseMfaCode } from '../forms.js';
	import { ReauthCancelled, withReauth } from '../reauth.svelte.js';
	import {
		activateTotp,
		deactivateTotp,
		getRecoveryCodes,
		getTotpSetup,
		listAuthenticators,
		regenerateRecoveryCodes,
		type Authenticators
	} from '../two-factor.js';
	import MfaCodeField from './mfa-code-field.svelte';
	import QrCode from './qr-code.svelte';
	import RecoveryCodes from './recovery-codes.svelte';

	type View =
		| { status: 'loading' }
		| { status: 'error' }
		| { status: 'off'; secret: string; totpUrl: string }
		| { status: 'on'; authenticators: Authenticators };

	let view = $state<View>({ status: 'loading' });
	/** Codes just made, shown once until the page is left. */
	let shownCodes = $state<string[] | null>(null);
	let code = $state('');
	let codeError = $state('');
	let problem = $state<string | null>(null);
	let busy = $state(false);
	let confirmOff = $state(false);
	/** Set when TOTP turned on but its recovery codes could not be read to show them. */
	let codesProblem = $state<string | null>(null);
	const CODES_UNREAD =
		"We couldn't show your recovery codes. Two-factor is on: make new recovery codes to see a new set.";

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

	function onSince(authenticators: Authenticators): string {
		const at = authenticators.totp?.createdAt;
		return at
			? `Two-factor authentication is on, since ${dateFormat.format(at)}.`
			: 'Two-factor authentication is on.';
	}

	async function load() {
		view = { status: 'loading' };
		try {
			const authenticators = await listAuthenticators();
			if (authenticators.totp) {
				view = { status: 'on', authenticators };
				return;
			}
			const setup = await getTotpSetup();
			view =
				setup.status === 'off'
					? { status: 'off', secret: setup.secret, totpUrl: setup.totpUrl }
					: { status: 'on', authenticators: await listAuthenticators() };
		} catch {
			view = { status: 'error' };
		}
	}

	onMount(() => void load());

	/** Run a change. Cancel in the reauthentication prompt leaves everything as it was. */
	async function act(change: () => Promise<void>, onField?: (message: string) => boolean) {
		if (busy) return;
		busy = true;
		problem = null;
		try {
			await change();
		} catch (cause) {
			if (cause instanceof ReauthCancelled) return;
			const error = asAppError(cause);
			const message = isAppError(error) ? error.fields.code?.[0] : undefined;
			if (!(message && onField?.(message))) problem = error.message;
		} finally {
			busy = false;
		}
	}

	function turnOn(event: SubmitEvent) {
		event.preventDefault();
		codeError = '';
		const parsed = parseMfaCode(code, 'totp');
		if (!parsed.success) {
			codeError = parsed.error.issues[0].message;
			document.getElementById('totp-code')?.focus();
			return;
		}
		return act(
			async () => {
				await withReauth(() => activateTotp(parsed.data.code));
				code = '';
				codesProblem = null;
				// TOTP is on now, whatever happens to the codes: always show the page as it is.
				try {
					shownCodes = (await withReauth(() => getRecoveryCodes()))?.codes ?? null;
				} catch {
					shownCodes = null;
					codesProblem = CODES_UNREAD;
				}
				await load();
			},
			(message) => {
				codeError = message;
				document.getElementById('totp-code')?.focus();
				return true;
			}
		);
	}

	function newCodes() {
		return act(async () => {
			const made = await withReauth(() => regenerateRecoveryCodes());
			codesProblem = null;
			shownCodes = made.codes;
			await load();
		});
	}

	function turnOff() {
		return act(async () => {
			await withReauth(() => deactivateTotp());
			shownCodes = null;
			codesProblem = null;
			await load();
		});
	}
</script>

<!-- The section pattern (plans/ux-cleanup #283): a line, the title, then the content. -->
<div aria-busy={busy}>
	{#if view.status === 'loading'}
		<LoadingState label="Loading your two-factor settings…" />
	{:else if view.status === 'error'}
		<div>
			<p class="max-w-md text-base text-muted">
				We can't load your two-factor settings right now. Check your connection and try again.
			</p>
			<Button variant="outline" size="sm" class="mt-4" onclick={() => load()}>Try again</Button>
		</div>
	{:else if view.status === 'off'}
		<Section title="Authenticator app">
			<div class="grid gap-8">
				<div class="grid gap-4">
					<p class="max-w-md text-base text-muted">
						Two-factor authentication is off. Turn it on to ask for a code from an authenticator app
						each time you sign in, as well as your password.
					</p>
					<p class="max-w-md text-base text-muted">
						Scan this QR code with your authenticator app, or type the setup key into it.
					</p>
					<QrCode value={view.totpUrl} label="QR code for your authenticator app" />
					<div class="grid gap-1">
						<span class="text-base font-semibold text-secondary">Setup key</span>
						<code class="font-mono text-base break-all text-secondary">{view.secret}</code>
					</div>
				</div>
				<form method="post" onsubmit={turnOn} novalidate class="grid max-w-md gap-4">
					<MfaCodeField id="totp-code" kind="totp" bind:value={code} error={codeError} />
					<Button type="submit" aria-disabled={busy} aria-busy={busy} class="justify-self-start">
						{#if busy}<Spinner />{/if}
						Turn on
					</Button>
				</form>
			</div>
		</Section>
	{:else}
		<Section title="Authenticator app">
			<div class="grid gap-4">
				<p class="max-w-md text-base text-muted">
					{onSince(view.authenticators)} Each sign-in asks for a code from your authenticator app.
				</p>
				<div>
					<Button variant="outline" onclick={() => (confirmOff = true)} aria-disabled={busy}>
						Turn off
					</Button>
				</div>
			</div>
		</Section>
	{/if}
	<!-- Shown whenever codes were just made, or could not be shown, whatever the rest shows:
		they are shown once, so a failed read of the page must not hide them. -->
	{#if view.status === 'on' || codesProblem || (shownCodes && shownCodes.length > 0)}
		<Section title="Recovery codes">
			<div class="grid gap-8">
				{#if view.status === 'on'}
					<div class="grid gap-4">
						{#if view.authenticators.recoveryCodes}
							<p class="max-w-md text-base text-muted">
								{view.authenticators.recoveryCodes.unused} of {view.authenticators.recoveryCodes
									.total} recovery codes unused.
							</p>
						{/if}
						<div>
							<Button variant="outline" onclick={newCodes} aria-disabled={busy}>
								Make new recovery codes
							</Button>
						</div>
					</div>
				{/if}
				{#if codesProblem}
					<Alert>
						<CircleAlertIcon aria-hidden="true" />
						<AlertTitle>{codesProblem}</AlertTitle>
					</Alert>
				{/if}
				{#if shownCodes && shownCodes.length > 0}
					<RecoveryCodes codes={shownCodes} />
				{/if}
			</div>
		</Section>
	{/if}
	{#if problem}
		<Alert variant="destructive" class="mt-8">
			<CircleAlertIcon aria-hidden="true" />
			<AlertTitle>{problem}</AlertTitle>
		</Alert>
	{/if}
</div>

<AlertDialog bind:open={confirmOff}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Turn off two-factor?</AlertDialogTitle>
			<AlertDialogDescription>
				Signing in will need only your password again, and your recovery codes stop working. This
				also signs you out on your other devices.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction
				variant="destructive-solid"
				onclick={() => {
					confirmOff = false;
					void turnOff();
				}}
			>
				Turn off two-factor
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
