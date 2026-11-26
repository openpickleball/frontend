<script lang="ts">
	import ActionDialog from './action-dialog.svelte';

	let {
		open = $bindable(false),
		onconfirm,
		onclosed
	}: {
		open?: boolean;
		/** Called when the player presses "Withdraw dispute", as the dialog closes. */
		onconfirm: () => void;
		/** Called once the dialog is gone and has handed focus back, however it closed. */
		onclosed?: () => void;
	} = $props();
</script>

<!-- A withdrawn dispute still counts as the player's one dispute, so the dialog says so first. -->
<ActionDialog
	bind:open
	title="Withdraw your dispute?"
	description="You can't dispute this match again after you withdraw. If no other player still disputes it, the match goes back to how it was before your dispute."
	action="Withdraw dispute"
	{onconfirm}
	{onclosed}
/>
