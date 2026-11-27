import { snapshot } from '$app/navigation';

/**
 * Brings a list screen back to where the player left it, when they return to it with the back
 * link or the browser's back or forward button. Call it while the component initializes.
 *
 * Home and Matches load their lists after they render. SvelteKit restores the scroll position
 * straight after a back navigation, while the page is still short, so it lands near the top.
 * This keeps the position in the history entry (SvelteKit's `snapshot`) and scrolls there again
 * once `ready()` is true, that is once the list has rendered at its full height.
 *
 * A new history entry, such as a nav tap or a link, has nothing to restore, so it starts at the
 * top as before. `id` names the screen, so each keeps its own position.
 */
export function keepScroll(id: string, ready: () => boolean): void {
	// Where to scroll once the list is ready. Null when there is nothing to restore.
	let target = $state<number | null>(null);

	snapshot({
		id,
		capture: () => window.scrollY,
		restore: (y: number) => {
			target = y;
		},
		reset: () => {
			target = null;
		}
	});

	$effect(() => {
		if (target === null || !ready()) return;
		const y = target;
		target = null;
		window.scrollTo({ top: y, behavior: 'instant' });
	});
}
