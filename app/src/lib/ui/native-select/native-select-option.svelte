<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLOptionAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLOptionAttributes> = $props();
</script>

<!-- The browser draws the open list, so options keep its colors. -->
<option bind:this={ref} data-slot="native-select-option" class={cn(className)} {...restProps}>
	{@render children?.()}
</option>
