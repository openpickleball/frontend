<script lang="ts">
	import { ThemeToggle } from '#lib/ui/theme-toggle/index.js';
	import Wordmark from './wordmark.svelte';
</script>

<!-- Mobile only: from 960px the side nav takes over. -->
<header
	class="sticky top-0 z-20 flex h-(--header-height) items-center justify-between gap-4 bg-primary/80 px-gutter backdrop-blur-md shell:hidden"
>
	<Wordmark />
	<ThemeToggle class="-mr-2" />
</header>
