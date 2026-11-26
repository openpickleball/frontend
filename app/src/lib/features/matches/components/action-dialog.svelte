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
		title,
		description,
		action,
		onconfirm,
		onclosed
	}: {
		open?: boolean;
		title: string;
		description: string;
		/** The label of the button that acts. */
		action: string;
		/** Called when the player presses the action button, as the dialog closes. */
		onconfirm: () => void;
		/** Called once the dialog is gone and has handed focus back, however it closed. */
		onclosed?: () => void;
	} = $props();

	// After the action the button that opened the dialog is gone, so the dialog must not send focus
	// back to it. The page moves focus to the new status instead. After Cancel, focus goes back as usual.
	let acting = false;

	function afterClose(event: Event) {
		if (acting) {
			acting = false;
			event.preventDefault();
		}
		onclosed?.();
	}
</script>

<!--
  One AlertDialog for every screen size, for a match action the player should confirm first. Its
  content is a sheet at the bottom of the screen under 768px and a centered dialog above
  (ui/alert-dialog), and it opens on Cancel.
-->
<AlertDialog bind:open>
	<AlertDialogContent onCloseAutoFocus={afterClose}>
		<AlertDialogHeader>
			<AlertDialogTitle>{title}</AlertDialogTitle>
			<AlertDialogDescription>{description}</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction
				onclick={() => {
					acting = true;
					open = false;
					onconfirm();
				}}
			>
				{action}
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
