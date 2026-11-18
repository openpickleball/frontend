<script lang="ts">
	let { id, message }: { id: string; message: string } = $props();
</script>

<p {id} class="flex items-start gap-2 text-sm font-medium text-danger">
	<span
		aria-hidden="true"
		class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-danger text-[11px] leading-none font-bold text-primary"
		>!</span
	>
	<span>{message}</span>
</p>
