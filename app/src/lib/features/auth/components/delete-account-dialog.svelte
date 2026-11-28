<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { untrack, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MFA_REQUIRED } from '#lib/api/index.js';
	import { ROUTES } from '#lib/domain/index.js';
	import { Alert, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle,
		AlertDialogTrigger
	} from '#lib/ui/alert-dialog/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { TextField } from '#lib/ui/field/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { asAppError } from '../forms.js';
	import { ReauthCancelled, requestReauth, withReauth } from '../reauth.svelte.js';
	import { checkMfaEnrolled, deleteAccount, unsentMatches } from '../services.js';
	import { session } from '../session.svelte.js';

	/**
	 * "Delete your account": says what goes and what stays, asks for the word `delete`, then
	 * deletes the account through `withReauth` and goes to sign in. It stays open until the backend
	 * answers, so a refusal shows here.
	 */
	let {
		open = $bindable(false),
		trigger
	}: {
		open?: boolean;
		/**
		 * Render the opener yourself, such as Profile's row. Spread `props` on a button. Without it,
		 * the opener is a "Delete your account" button.
		 */
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	const WORD = 'delete';

	type Problem =
		{ kind: 'mfa'; enrolled: boolean } | { kind: 'staff' } | { kind: 'message'; text: string };

	let typed = $state('');
	let busy = $state(false);
	let problem = $state<Problem | null>(null);
	let unsent = $state(0);
	const matches = $derived(typed.trim().toLowerCase() === WORD);

	// Each time it opens: an empty field, no error, and the unsent count as it is now. The count's
	// source reads reactive state (the offline queue), so it is untracked: a queue change while the
	// dialog is open must not run this reset again.
	$effect.pre(() => {
		if (!open) return;
		typed = '';
		problem = null;
		unsent = untrack(unsentMatches);
	});

	/**
	 * Does the account have two-factor? As `watchMfaRequired` decides: the cached answer only when
	 * it says on, because two-factor turned on from another device is the usual way to meet this.
	 */
	async function mfaEnrolled(): Promise<boolean> {
		if (session.mfaEnrolled === true) return true;
		return (await checkMfaEnrolled()) === true;
	}

	async function problemOf(cause: unknown): Promise<Problem> {
		const error = asAppError(cause);
		if (error.status === 403 && error.code === MFA_REQUIRED) {
			return { kind: 'mfa', enrolled: await mfaEnrolled() };
		}
		if (error.status === 409) return { kind: 'staff' };
		return { kind: 'message', text: error.message };
	}

	async function confirm() {
		if (busy || !matches) return;
		busy = true;
		problem = null;
		try {
			// Deleted, or maybe deleted when the answer was lost: either way the service has already
			// ended the account on this device, and sign in says which.
			await withReauth(() => deleteAccount());
		} catch (cause) {
			if (!(cause instanceof ReauthCancelled)) problem = await problemOf(cause);
			return;
		} finally {
			busy = false;
		}
		await goto(resolve(ROUTES.login));
	}

	/** This session has not passed two-factor: confirm with a code, then the player deletes again. */
	async function enterCode() {
		if (await requestReauth(['code'])) problem = null;
	}

	/** No way out while the delete is in flight: its answer belongs to this dialog. */
	function setOpen(next: boolean) {
		if (next || !busy) open = next;
	}

	function holdWhileBusy(blocked: Event) {
		if (busy) blocked.preventDefault();
	}
</script>

<AlertDialog bind:open={() => open, setOpen}>
	<AlertDialogTrigger>
		{#snippet child({ props })}
			{#if trigger}
				{@render trigger({ props })}
			{:else}
				<Button {...props} variant="destructive" size="sm">Delete your account</Button>
			{/if}
		{/snippet}
	</AlertDialogTrigger>
	<AlertDialogContent
		class="max-h-svh overflow-y-auto"
		onEscapeKeydown={holdWhileBusy}
		onInteractOutside={holdWhileBusy}
	>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete your account?</AlertDialogTitle>
			<AlertDialogDescription>This can't be undone.</AlertDialogDescription>
		</AlertDialogHeader>
		<div class="grid max-w-md gap-4 text-base">
			<div class="grid gap-1">
				<h3 class="text-base font-semibold text-secondary">What goes</h3>
				<p class="text-muted">
					Your email address, password, names, birth month and year, gender division, city and
					region, privacy settings, sign-in sessions, two-factor methods and organizer memberships.
				</p>
			</div>
			<div class="grid gap-1">
				<h3 class="text-base font-semibold text-secondary">What stays</h3>
				<p class="text-muted">
					If you played matches, they stay, so other players' ratings don't change. In those matches
					you show as "Private player", and your player keeps its OPEN Code.
				</p>
			</div>
			<p class="text-muted">
				You can sign up again later with the same email address, as a new player who starts fresh.
			</p>
		</div>
		{#if unsent > 0}
			<Alert>
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>
					{#if unsent === 1}
						1 match hasn't been sent yet. It's only on this device, and deleting your account
						deletes it.
					{:else}
						{unsent} matches haven't been sent yet. They're only on this device, and deleting your account
						deletes them.
					{/if}
				</AlertTitle>
			</Alert>
		{/if}
		<TextField
			id="delete-account-word"
			label="Type delete to confirm"
			bind:value={typed}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			disabled={busy}
		/>
		{#if problem}
			<Alert variant="destructive">
				<CircleAlertIcon aria-hidden="true" />
				{#if problem.kind === 'mfa' && problem.enrolled}
					<AlertTitle>
						Confirm with a code from your authenticator app, then press Delete account again.
					</AlertTitle>
					<AlertDescription>
						<Button variant="link" size="inline" onclick={enterCode}>Enter a code</Button>
					</AlertDescription>
				{:else if problem.kind === 'mfa'}
					<AlertTitle>Your account needs two-factor sign-in before it can be deleted.</AlertTitle>
					<AlertDescription>
						<Button variant="link" size="inline" href={resolve(ROUTES.twoFactor)}>
							Go to two-factor authentication
						</Button>
					</AlertDescription>
				{:else if problem.kind === 'staff'}
					<AlertTitle>
						A staff account can't be deleted here. Email
						<Button variant="link" size="inline" href="mailto:info@openpb.org">
							info@openpb.org
						</Button>
						for help.
					</AlertTitle>
				{:else}
					<AlertTitle>{problem.text}</AlertTitle>
				{/if}
			</Alert>
		{/if}
		<AlertDialogFooter>
			<AlertDialogCancel aria-disabled={busy}>Cancel</AlertDialogCancel>
			<AlertDialogAction
				variant="destructive-solid"
				disabled={!matches}
				aria-disabled={busy}
				aria-busy={busy}
				onclick={confirm}
			>
				{#if busy}<Spinner />{/if}
				Delete account
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
