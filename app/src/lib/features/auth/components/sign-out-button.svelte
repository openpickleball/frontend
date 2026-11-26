<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
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
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { logout, signOutWarning } from '../services.js';

	let { class: className }: { class?: string } = $props();
	let busy = $state(false);
	/** Set when signing out would delete something from this device: the player decides first. */
	let warning = $state<string | null>(null);
	let asking = $state(false);

	function start() {
		if (busy) return;
		warning = signOutWarning();
		if (warning) {
			asking = true;
			return;
		}
		void signOut();
	}

	async function signOut() {
		if (busy) return;
		busy = true;
		try {
			await logout();
		} catch {
			// logout() has already cleared the session here, so leave either way.
		} finally {
			busy = false;
		}
		await goto(resolve(ROUTES.login));
	}
</script>

<Button
	variant="outline"
	size="sm"
	aria-disabled={busy}
	aria-busy={busy}
	onclick={start}
	class={className}
>
	{#if busy}<Spinner />{/if}
	Sign out
</Button>

<AlertDialog bind:open={asking}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Sign out and delete unsent matches?</AlertDialogTitle>
			<AlertDialogDescription>{warning}</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Stay signed in</AlertDialogCancel>
			<AlertDialogAction
				variant="destructive-solid"
				onclick={() => {
					asking = false;
					void signOut();
				}}
			>
				Sign out and delete
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
