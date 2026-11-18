<script lang="ts">
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

	let {
		open = $bindable(false),
		onconfirm
	}: {
		open?: boolean;
		/** Called when the player presses "Dispute score", as the dialog closes. */
		onconfirm: () => void;
	} = $props();

	// After "Dispute score" the Dispute button is gone, so the dialog must not send focus back to
	// it. The page moves focus to the new status instead. After Cancel, focus goes back as usual.
	let disputing = false;

	function keepFocusAway(event: Event) {
		if (!disputing) return;
		disputing = false;
		event.preventDefault();
	}
</script>

<!--
  One AlertDialog for every screen size. Its content is a sheet at the bottom of the screen under
  640px and a centered dialog above (ui/alert-dialog), and it opens on Cancel. It asks for no reason,
  since the API takes none.
-->
<AlertDialog bind:open>
	<AlertDialogContent onCloseAutoFocus={keepFocusAway}>
		<AlertDialogHeader>
			<AlertDialogTitle>Dispute this score?</AlertDialogTitle>
			<AlertDialogDescription>
				This marks the match as disputed. No one can confirm it while it is disputed, and you can't
				undo a dispute.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction
				onclick={() => {
					disputing = true;
					open = false;
					onconfirm();
				}}>Dispute score</AlertDialogAction
			>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
