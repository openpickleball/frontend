<script lang="ts">
	import { resolve } from '$app/paths';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import { ROUTES } from '#lib/domain/index.js';
	import { Alert, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { session } from '../session.svelte.js';

	/**
	 * For an organizer member without two-factor: organizer actions need it (backend ADR 0043).
	 * Display only: the backend enforces it. Nothing renders for anyone else, or while the
	 * memberships or two-factor are unknown.
	 */
	let { link = false }: { /** Show a link to the two-factor page. */ link?: boolean } = $props();
</script>

{#if session.isOrganizer && session.mfaEnrolled === false}
	<Alert>
		<ShieldAlertIcon aria-hidden="true" />
		<AlertTitle>Organizer actions need two-factor authentication.</AlertTitle>
		<AlertDescription>
			Turn on two-factor authentication to act for your organizer.
			{#if link}
				<Button variant="link" size="inline" href={resolve(ROUTES.twoFactor)}>
					Set up two-factor
				</Button>
			{/if}
		</AlertDescription>
	</Alert>
{/if}
