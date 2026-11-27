<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '#lib/ui/utils.js';
	import PopoverPortal from './popover-portal.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		align = 'center',
		collisionPadding = 16,
		portalProps,
		...restProps
	}: PopoverPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>;
	} = $props();
</script>

<!--
	Restyled to our tokens: a raised panel like the combobox list, fading in like the dialogs.
	collisionPadding keeps it 16px off the screen edge on a phone.
-->
<PopoverPortal {...portalProps}>
	<PopoverPrimitive.Content
		bind:ref
		data-slot="popover-content"
		{sideOffset}
		{align}
		{collisionPadding}
		class={cn(
			'z-50 grid w-72 gap-2 rounded-2xl border border-field bg-surface p-4 text-base text-secondary shadow-lg outline-none data-[state=open]:animate-fade-in',
			className
		)}
		{...restProps}
	/>
</PopoverPortal>
