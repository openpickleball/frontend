<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { ROUTES } from '#lib/domain/index.js';
	import { OrganizerMfaPrompt, TwoFactorSettings, session } from '#lib/features/auth/index.js';
	import { Button } from '#lib/ui/button/index.js';
</script>

<svelte:head>
	<title>Two-factor authentication · OPEN Pickleball</title>
</svelte:head>

<!-- Inside pt-4, as the match page is, so the link and title line up. -->
<div class="pt-4">
	<!-- Back to Profile, then the title, as on the match page. -->
	<Button
		variant="link"
		href={resolve(ROUTES.profile)}
		class="mt-2 min-h-10 px-0 text-base font-normal text-muted"
	>
		<ArrowLeftIcon class="size-4" aria-hidden="true" />Profile
	</Button>

	<div class="pt-4">
		<h1 class="page-title">Two-factor authentication</h1>
	</div>

	{#if session.isSignedIn}
		<OrganizerMfaPrompt class="mt-8" />
		<TwoFactorSettings />
	{/if}
</div>
