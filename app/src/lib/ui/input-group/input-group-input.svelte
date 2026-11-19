<script lang="ts">
	import { Input } from '#lib/ui/input/index.js';
	import { cn } from '#lib/ui/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...props
	}: ComponentProps<typeof Input> = $props();
</script>

<!-- The group draws the border, the focus ring and the error state. -->
<Input
	bind:ref
	data-slot="input-group-control"
	class={cn(
		'h-full flex-1 rounded-none border-0 bg-transparent outline-none hover:border-0 aria-invalid:shadow-none',
		className
	)}
	bind:value
	{...props}
/>
