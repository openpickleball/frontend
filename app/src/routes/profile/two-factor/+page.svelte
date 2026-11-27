<script lang="ts">
	import { OrganizerMfaPrompt, TwoFactorSettings, session } from '#lib/features/auth/index.js';
	import { SettingsPage } from '#lib/features/players/index.js';
</script>

<svelte:head>
	<title>Two-factor authentication · OPEN Pickleball</title>
</svelte:head>

<SettingsPage title="Two-factor authentication">
	{#if session.isSignedIn}
		<OrganizerMfaPrompt class="mt-8" />
		<TwoFactorSettings />
	{/if}
</SettingsPage>
