<script lang="ts">
	import { CorrectView } from '#lib/features/matches/index.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

<div class="pt-4">
	<CorrectView code={params.code} />
</div>
