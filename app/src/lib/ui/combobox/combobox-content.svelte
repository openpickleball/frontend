<script lang="ts">
	import { Combobox as ComboboxPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '#lib/ui/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 6,
		children,
		...restProps
	}: WithoutChild<ComboboxPrimitive.ContentProps> = $props();
</script>

<!--
	The list under a combobox input, as wide as the input. Focus stays in the input: a press on the
	list's padding or scrollbar must not blur it, so the list cancels mousedown. Options select on
	pointerup, which this does not touch.
-->
<ComboboxPrimitive.Portal>
	<ComboboxPrimitive.Content
		bind:ref
		{sideOffset}
		data-slot="combobox-content"
		onmousedown={(event: MouseEvent) => event.preventDefault()}
		class={cn(
			'z-50 flex max-h-(--bits-combobox-content-available-height) w-(--bits-combobox-anchor-width) flex-col overflow-hidden rounded-2xl border border-field bg-surface shadow-lg',
			className
		)}
		{...restProps}
	>
		<ComboboxPrimitive.Viewport class="max-h-72 overflow-y-auto py-1">
			{@render children?.()}
		</ComboboxPrimitive.Viewport>
	</ComboboxPrimitive.Content>
</ComboboxPrimitive.Portal>
