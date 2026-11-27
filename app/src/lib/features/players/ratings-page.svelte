<script lang="ts">
	import { untrack } from 'svelte';
	import { Section } from '#lib/ui/section/index.js';
	import { myCode } from './my-code.svelte.js';
	import { MyRatings } from './my-ratings.svelte.js';
	import OwnCodeGate from './own-code-gate.svelte';
	import RatingHistory from './rating-history.svelte';
	import { RatingHistoryView } from './rating-history.svelte.js';
	import RatingsCard from './ratings-card.svelte';

	const ratings = new MyRatings();
	const history = new RatingHistoryView();

	$effect(() => {
		const code = myCode.code;
		untrack(() => {
			void ratings.load(code);
			void history.load(code);
		});
		return () => {
			ratings.cancel();
			history.cancel();
		};
	});
</script>

<div class="pt-4">
	<h1 class="page-title">Ratings</h1>
</div>

<!-- Each section brings its own space above. -->
<OwnCodeGate
	fallbackClass="mt-8"
	loading="Loading your ratings…"
	signedOut="Sign in to see your ratings."
	errorText="We can't reach the server, so we can't load your ratings. Check your connection and try again."
>
	{#snippet children(code)}
		<RatingsCard
			title="Current ratings"
			prominent
			ratings={ratings.ratings}
			loading={ratings.loading}
			failed={ratings.failed}
		/>
		<Section title="Rating history">
			<RatingHistory {history} underTitle onpage={(offset) => void history.load(code, offset)} />
		</Section>
	{/snippet}
</OwnCodeGate>
