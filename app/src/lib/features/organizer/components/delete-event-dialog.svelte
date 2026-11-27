<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import type { OrganizerEvent } from '#lib/domain/index.js';
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
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { DELETE_TEXT, deleteTitle, eventErrorCopy } from '../copy.js';
	import { deleteOrganizerEvent } from '../services.js';

	/**
	 * Confirms a delete, naming the Event. It stays open until the backend answers, so a refusal
	 * (matches or results files, or a 404) shows here.
	 */
	let {
		open = $bindable(false),
		event,
		ondeleted,
		ongone
	}: {
		open?: boolean;
		event: OrganizerEvent | null;
		ondeleted: (code: string) => void;
		/** The delete got 404: the Event or the authority to delete it is gone. */
		ongone: () => void;
	} = $props();

	let busy = $state(false);
	let problem = $state<string | null>(null);

	$effect.pre(() => {
		if (open) problem = null;
	});

	async function confirm() {
		if (!event || busy) return;
		busy = true;
		problem = null;
		try {
			await deleteOrganizerEvent(event.code);
			open = false;
			ondeleted(event.code);
		} catch (error) {
			problem = eventErrorCopy(error, 'delete').message;
			if (
				typeof error === 'object' &&
				error !== null &&
				'status' in error &&
				error.status === 404
			) {
				ongone();
			}
		} finally {
			busy = false;
		}
	}
</script>

<AlertDialog bind:open>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>{deleteTitle(event?.name ?? '')}</AlertDialogTitle>
			<AlertDialogDescription>{DELETE_TEXT}</AlertDialogDescription>
		</AlertDialogHeader>
		{#if problem}
			<Alert variant="destructive">
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>{problem}</AlertTitle>
			</Alert>
		{/if}
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction aria-disabled={busy} aria-busy={busy} onclick={confirm}>
				{#if busy}<Spinner />{/if}
				Delete
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
