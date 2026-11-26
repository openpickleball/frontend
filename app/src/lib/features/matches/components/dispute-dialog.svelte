<script lang="ts">
	import ActionDialog from './action-dialog.svelte';

	let {
		open = $bindable(false),
		onconfirm,
		onclosed
	}: {
		open?: boolean;
		/** Called when the player presses "Dispute score", as the dialog closes. */
		onconfirm: () => void;
		/** Called once the dialog is gone and has handed focus back, however it closed. */
		onclosed?: () => void;
	} = $props();
</script>

<!-- It asks for no reason, since the API takes none. -->
<ActionDialog
	bind:open
	title="Dispute this score?"
	description="This marks the match as disputed. No one can confirm it while it is disputed. You can withdraw your dispute later, but you can only dispute a match once."
	action="Dispute score"
	{onconfirm}
	{onclosed}
/>
