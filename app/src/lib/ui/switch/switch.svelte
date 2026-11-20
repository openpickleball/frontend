<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '#lib/ui/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> = $props();
</script>

<!--
	An on and off switch. On fills the track with the text color. Bits UI sets aria-checked, so
	the aria-checked variant styles it. The after: box widens the touch target to 44px.
-->
<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		'group/switch relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-field bg-transparent transition-colors outline-none after:absolute after:-inset-x-1 after:-inset-y-2.5 focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-45 aria-checked:border-secondary aria-checked:bg-secondary',
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="pointer-events-none mx-0.5 block size-4 rounded-full bg-muted transition-transform group-aria-checked/switch:translate-x-5 group-aria-checked/switch:bg-primary motion-reduce:transition-none"
	/>
</SwitchPrimitive.Root>
