<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { untrack } from 'svelte';
	import { ROUTES } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { myCode } from './my-code.svelte.js';
	import OwnCodeGate from './own-code-gate.svelte';
	import RatingHistory from './rating-history.svelte';
	import { RatingHistoryView } from './rating-history.svelte.js';

	const history = new RatingHistoryView();

	$effect(() => {
		const code = myCode.code;
		untrack(() => void history.load(code));
		return () => history.cancel();
	});
</script>

<Button
	variant="link"
	href={resolve(ROUTES.profile)}
	class="mt-2 min-h-10 px-0 text-base font-normal text-muted"
>
	<ArrowLeftIcon class="size-4" aria-hidden="true" />Profile
</Button>

<div class="pt-4">
	<h1 class="page-title">Rating history</h1>
</div>

<div class="mt-8">
	<OwnCodeGate
		loading="Loading your rating history…"
		signedOut="Sign in to see your rating history."
		errorText="We can't reach the server, so we can't load your rating history. Check your connection and try again."
	>
		{#snippet children(code)}
			<RatingHistory {history} onpage={(offset) => void history.load(code, offset)} />
		{/snippet}
	</OwnCodeGate>
</div>
