<script lang="ts">
	let {
		title,
		open = true,
		draggable = true,
		onClose = () => {},
		children
	}: {
		title: string;
		open?: boolean;
		draggable?: boolean;
		onClose?: () => void;
		children: import('svelte').Snippet;
	} = $props();

	let x = $state(0);
	let y = $state(0);
	let dragStart = $state<{
		pointerId: number;
		x: number;
		y: number;
		originX: number;
		originY: number;
	} | null>(null);

	function startDrag(event: PointerEvent) {
		if (!draggable || event.target instanceof HTMLButtonElement) return;
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		dragStart = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			originX: x,
			originY: y
		};
	}

	function drag(event: PointerEvent) {
		if (!dragStart || dragStart.pointerId !== event.pointerId) return;
		x = dragStart.originX + event.clientX - dragStart.x;
		y = dragStart.originY + event.clientY - dragStart.y;
	}

	function stopDrag(event: PointerEvent) {
		if (dragStart?.pointerId !== event.pointerId) return;
		dragStart = null;
	}
</script>

{#if open}
	<section
		class="window"
		class:dragging={dragStart}
		style:--window-x={`${x}px`}
		style:--window-y={`${y}px`}
		aria-label={title}
	>
		<header
			class="window-title"
			class:draggable
			role="button"
			tabindex="0"
			onpointerdown={startDrag}
			onpointermove={drag}
			onpointerup={stopDrag}
			onpointercancel={stopDrag}
		>
			<strong>{title}</strong>
			<button type="button" aria-label={`Close ${title}`} onclick={onClose}>x</button>
		</header>
		<div class="window-body">
			{@render children()}
		</div>
	</section>
{/if}
