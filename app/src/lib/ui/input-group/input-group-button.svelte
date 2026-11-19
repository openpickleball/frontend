<script lang="ts">
	import { Button } from '#lib/ui/button/index.js';
	import { cn } from '#lib/ui/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		children,
		type = 'button',
		variant = 'ghost',
		...restProps
	}: Omit<ComponentProps<typeof Button>, 'href' | 'size'> = $props();
</script>

<Button
	bind:ref
	{type}
	{variant}
	class={cn('px-3.5 text-sm font-semibold text-muted hover:text-secondary', className)}
	{...restProps}
>
	{@render children?.()}
</Button>
