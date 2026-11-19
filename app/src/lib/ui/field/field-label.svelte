<script lang="ts">
	import { Label } from '#lib/ui/label/index.js';
	import type { ComponentProps } from 'svelte';

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Label> = $props();
</script>

<Label bind:ref data-slot="field-label" {...restProps} />
