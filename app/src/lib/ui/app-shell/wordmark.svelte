<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<!-- eslint-disable local/no-arbitrary-tailwind-values -- optical nudge in em so the wordmark lines up with the page edge -->
<a
	href={resolve('/')}
	class="-mr-[0.1em] inline-flex items-center gap-3 font-display text-lg leading-none tracking-widest"
>
	<span class="mark size-6" aria-hidden="true"></span>
	OPEN
</a>
<!-- eslint-enable local/no-arbitrary-tailwind-values -->
