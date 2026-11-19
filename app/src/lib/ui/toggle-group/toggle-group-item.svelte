<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '#lib/ui/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ToggleGroupPrimitive.ItemProps = $props();
</script>

<!-- The selected segment looks like the solid call to action. -->
<ToggleGroupPrimitive.Item
	bind:ref
	data-slot="toggle-group-item"
	class={cn(
		'grid h-[38px] min-w-22 place-items-center rounded-full px-[18px] text-[15px] font-medium text-muted transition-colors hover:text-secondary disabled:pointer-events-none disabled:opacity-45 data-[state=on]:bg-secondary data-[state=on]:font-semibold data-[state=on]:text-primary data-[state=on]:hover:text-primary',
		className
	)}
	{...restProps}
/>
