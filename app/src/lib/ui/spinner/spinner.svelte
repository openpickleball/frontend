<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { cn } from '#lib/ui/utils.js';
	import type { ComponentProps } from 'svelte';

	// Decorative by default: put it next to text that says what is happening (a busy button's
	// own label, or a role="status" line). Pass `role="status"` and an `aria-label` to use it
	// alone. The spin stops under reduced motion, leaving a still ring beside the text.
	let { class: className, role, ...restProps }: ComponentProps<typeof LoaderCircleIcon> = $props();
</script>

<LoaderCircleIcon
	{role}
	aria-hidden={role ? undefined : 'true'}
	class={cn('size-4 motion-safe:animate-spin', className)}
	{...restProps}
/>
