<script lang="ts">
	import { HistoryView } from '#lib/features/matches/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="pt-4">
	<HistoryView page={data.page} show={data.show} />
</div>
