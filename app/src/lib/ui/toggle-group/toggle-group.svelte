<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '#lib/ui/utils.js';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: ToggleGroupPrimitive.RootProps = $props();
</script>

<!--
Discriminated unions and destructuring (needed for bindable) do not get along, so `value` is cast
to `never`.
-->
<ToggleGroupPrimitive.Root
	bind:value={value as never}
	bind:ref
	data-slot="toggle-group"
	class={cn(
		'inline-flex w-fit items-center gap-1 rounded-full border border-field bg-surface p-1',
		className
	)}
	{...restProps}
/>
