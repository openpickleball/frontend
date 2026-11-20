<script lang="ts">
	import { onMount } from 'svelte';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Button } from '#lib/ui/button/index.js';
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

<!-- 44px target (size-11), larger than the icon size: the pull-in from the edge stays in the caller. -->
<Button
	variant="ghost"
	size="icon"
	aria-label={toggleLabel(theme)}
	class={cn('size-11 text-muted hover:text-secondary', className)}
	onclick={toggle}
>
	<!-- Sun, shown in the black theme. Moon, shown in the ivory theme. -->
	<SunIcon class="size-5 light:hidden" aria-hidden="true" />
	<MoonIcon class="hidden size-5 light:block" aria-hidden="true" />
</Button>
