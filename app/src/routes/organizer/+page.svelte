<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { session } from '#lib/features/auth/index.js';
	import { OrganizerEvents, PAGE_TITLE } from '#lib/features/organizer/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// A read of the memberships (after a refusal, say) that finds none takes the page away: the
	// load runs again and answers not found. Once per loss: the load may retry a failed read, and
	// a retry that fails too writes another empty list, which must not run the load yet again.
	// Membership coming back arms it again.
	let reloaded = false;
	$effect(() => {
		if (session.isOrganizer) {
			reloaded = false;
		} else if (session.organizers !== null && !reloaded) {
			reloaded = true;
			void invalidateAll();
		}
	});
</script>

<svelte:head>
	<title>{PAGE_TITLE} · OPEN Pickleball</title>
</svelte:head>

<h1 class="page-title">{PAGE_TITLE}</h1>

<OrganizerEvents page={data.page} />
