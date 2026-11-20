<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
	import { cn } from '#lib/ui/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(''),
		...restProps
	}: RadioGroupPrimitive.RootProps = $props();
</script>

<!-- The group is a segmented control: a rounded track that holds the pills. -->
<RadioGroupPrimitive.Root
	bind:ref
	bind:value
	data-slot="radio-group"
	class={cn('inline-flex w-fit max-w-full rounded-full border border-field p-1', className)}
	{...restProps}
/>
