<script lang="ts">
	/**
	 * How many matches need the player, on the Home item of the tab bar and the side nav. Drawn
	 * for the eye only: the link's name says the same in hidden text (`needsYouName`).
	 * Our own code: the shadcn-svelte sidebar menu badge would overwrite our restyled parts, and
	 * the status Badge is an outlined pill with a dot, not a count.
	 */
	let { count, class: className }: { count: number; class?: string } = $props();
</script>

<span
	class={[
		'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs leading-none font-semibold text-primary tabular-nums',
		className
	]}
	aria-hidden="true"
	data-testid="needs-you-badge"
>
	{count > 99 ? '99+' : count}
</span>
