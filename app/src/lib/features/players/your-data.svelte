<script lang="ts">
	import { Button } from '#lib/ui/button/index.js';

	/** How to get a copy of your data, on Profile > Copy of your data. */
	let { class: className }: { class?: string } = $props();
</script>

<p class={['max-w-md text-base text-muted', className]}>
	You can always get a copy of your data. A download in the app is not ready yet. Until then, email
	<Button variant="link" size="inline" href="mailto:info@openpb.org">info@openpb.org</Button>
	to ask for it.
</p>
