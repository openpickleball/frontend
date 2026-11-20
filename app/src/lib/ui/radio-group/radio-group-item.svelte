<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
	import { cn } from '#lib/ui/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: RadioGroupPrimitive.ItemProps = $props();
</script>

<!-- A pill with its label inside. The checked pill is filled. Focus uses the one focus ring. -->
<RadioGroupPrimitive.Item
	bind:ref
	data-slot="radio-group-item"
	class={cn(
		'flex min-h-11 cursor-pointer items-center rounded-full px-4 text-base font-semibold text-muted transition-colors outline-none select-none hover:text-secondary focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-secondary data-[state=checked]:text-primary data-[state=checked]:hover:text-primary',
		className
	)}
	{...restProps}
/>
