<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '#lib/ui/utils.js';
	import { applyTheme, currentTheme, nextTheme, toggleLabel, type Theme } from './theme.js';

	let { class: className }: { class?: string } = $props();

	// The server render and the first client render assume the dark theme. onMount reads the real one.
	let theme = $state<Theme>('dark');

	onMount(() => {
		const system = window.matchMedia('(prefers-color-scheme: light)');
		const sync = () => (theme = currentTheme(document.documentElement, system.matches));
		sync();
		// The label follows the system setting while there is no stored choice.
		system.addEventListener('change', sync);
		return () => system.removeEventListener('change', sync);
	});

	function toggle() {
		const next = nextTheme(theme);
		const change = () => {
			applyTheme(next, document, localStorage);
			theme = next;
		};
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
		// Crossfade the whole page where view transitions exist. Reduced motion switches at once.
		if (document.startViewTransition && !reduce.matches && document.visibilityState === 'visible') {
			// A skipped transition still applies the theme, so its rejection is not an error.
			document.startViewTransition(change).ready.catch(() => {});
		} else {
			change();
		}
	}
</script>

<button
	type="button"
	aria-label={toggleLabel(theme)}
	class={cn(
		'grid size-9 place-items-center rounded-full text-muted transition-colors hover:text-secondary',
		className
	)}
	onclick={toggle}
>
	<!-- Sun, shown in the black theme. -->
	<svg
		class="size-[18px] light:hidden"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="4.25" />
		<path
			d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
		/>
	</svg>
	<!-- Moon, shown in the ivory theme. -->
	<svg
		class="hidden size-[18px] light:block"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
	</svg>
</button>
