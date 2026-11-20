<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLFieldsetAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLFieldsetAttributes> = $props();
</script>

<!-- Groups related controls under a FieldLegend. -->
<fieldset bind:this={ref} data-slot="field-set" class={cn('grid gap-2', className)} {...restProps}>
	{@render children?.()}
</fieldset>
