<script lang="ts">
	import { encode } from 'uqr';

	/**
	 * A QR code drawn as one inline SVG path, so it needs no image and no style attribute (the
	 * content security policy allows neither). Dark modules on a white square with a quiet zone,
	 * in both themes, so any camera can read it.
	 */
	let { value, label }: { value: string; label: string } = $props();

	const qr = $derived(encode(value, { border: 4 }));
	const path = $derived.by(() => {
		let d = '';
		qr.data.forEach((row, y) => {
			row.forEach((dark, x) => {
				if (dark) d += `M${x} ${y}h1v1h-1z`;
			});
		});
		return d;
	});
</script>

<svg
	role="img"
	aria-label={label}
	viewBox="0 0 {qr.size} {qr.size}"
	shape-rendering="crispEdges"
	class="size-48"
>
	<rect width={qr.size} height={qr.size} class="fill-white" />
	<path d={path} class="fill-black" />
</svg>
