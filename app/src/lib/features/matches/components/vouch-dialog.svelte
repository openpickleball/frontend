<script lang="ts">
	import ActionDialog from './action-dialog.svelte';

	let {
		open = $bindable(false),
		onconfirm,
		onclosed
	}: {
		open?: boolean;
		/** Called when the player presses "Vouch for match", as the dialog closes. */
		onconfirm: () => void;
		/** Called once the dialog is gone and has handed focus back, however it closed. */
		onclosed?: () => void;
	} = $props();
</script>

<!-- A vouch can't be undone, so the dialog says so first. It takes nothing away, so it isn't red. -->
<ActionDialog
	bind:open
	tone="primary"
	title="Vouch for this match?"
	description="Vouch only if this is a separate match, not a repeat of the other one. You can't undo a vouch."
	action="Vouch for match"
	{onconfirm}
	{onclosed}
/>
