<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle
	} from '#lib/ui/empty/index.js';

	let { onHome = false }: { onHome?: boolean } = $props();
</script>

<section class="mt-8 border-t border-line pt-8" aria-labelledby="empty-title">
	<Empty>
		<EmptyHeader>
			<EmptyMedia>
				<span class="mark size-10 text-line" aria-hidden="true"></span>
			</EmptyMedia>
			<EmptyTitle id="empty-title">No matches yet</EmptyTitle>
			<EmptyDescription>
				{#if onHome}
					<p>
						Record your first match to start your history. You'll need the OPEN code of everyone who
						played.
					</p>
					<p>Other players need your code to add you to a match they record.</p>
				{:else}
					<p>
						Matches you record, and matches other players record with you in them, show up here.
					</p>
				{/if}
			</EmptyDescription>
		</EmptyHeader>
		<EmptyContent>
			<Button href={resolve(ROUTES.record)}>Record a match</Button>
		</EmptyContent>
	</Empty>
</section>
