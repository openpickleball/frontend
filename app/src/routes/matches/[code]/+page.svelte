<script lang="ts">
	import { MatchView } from '#lib/features/matches/index.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

<div class="pt-4">
	<MatchView code={params.code} />
</div>
