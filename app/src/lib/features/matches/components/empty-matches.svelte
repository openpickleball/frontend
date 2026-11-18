<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/ui/button/index.js';

	let { onHome = false }: { onHome?: boolean } = $props();
</script>

<section class="mt-8 border-t border-line pt-10" aria-labelledby="empty-title">
	<span class="mark size-10 text-line" aria-hidden="true"></span>
	<h2 id="empty-title" class="mt-[18px] text-[22px] font-semibold tracking-tight">
		No matches yet
	</h2>
	{#if onHome}
		<p class="mt-2 max-w-[46ch] text-muted">
			Record your first match to start your history. You'll need the OPEN code of everyone who
			played.
		</p>
		<p class="mt-2 max-w-[46ch] text-muted">
			Other players need your code to add you to a match they record.
		</p>
	{:else}
		<p class="mt-2 max-w-[46ch] text-muted">
			Matches you record, and matches other players record with you in them, show up here.
		</p>
	{/if}
	<Button href={resolve('/record')} class="mt-6">Record a match</Button>
</section>
