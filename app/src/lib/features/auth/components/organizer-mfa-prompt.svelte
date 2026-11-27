<script lang="ts">
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import { session } from '../session.svelte.js';

	/**
	 * For an organizer member without two-factor: organizer actions need it (backend ADR 0043).
	 * Display only: the backend enforces it. Nothing renders for anyone else, or while the
	 * memberships or two-factor are unknown.
	 */
	let {
		class: className
	}: {
		/** Space around the callout, from where the page places it. */
		class?: string;
	} = $props();
</script>

{#if session.isOrganizer && session.mfaEnrolled === false}
	<!-- Only the title: the section or page around it has the way to set two-factor up (#284). -->
	<Alert class={className}>
		<ShieldAlertIcon aria-hidden="true" />
		<AlertTitle>Organizer actions need two-factor authentication.</AlertTitle>
	</Alert>
{/if}
