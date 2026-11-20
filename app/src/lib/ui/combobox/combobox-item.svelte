<script lang="ts">
	import { Combobox as ComboboxPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '#lib/ui/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children: childrenProp,
		...restProps
	}: WithoutChild<ComboboxPrimitive.ItemProps> = $props();
</script>

<!-- One option, 44px tall at least. The highlighted one (arrow keys or pointer) is shaded. -->
<ComboboxPrimitive.Item
	bind:ref
	data-slot="combobox-item"
	class={cn(
		'flex min-h-11 cursor-pointer items-center px-5 py-1.5 text-secondary outline-none select-none data-highlighted:bg-line',
		className
	)}
	{...restProps}
>
	{#snippet children(state)}
		{@render childrenProp?.(state)}
	{/snippet}
</ComboboxPrimitive.Item>
