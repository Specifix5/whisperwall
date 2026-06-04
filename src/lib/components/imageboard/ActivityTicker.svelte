<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	type Activity = {
		id: number;
		message: string;
		boardCode: string;
		threadId: number | null;
	};

	let { activities = [] }: { activities?: Activity[] } = $props();
	let liveActivities = $state<Activity[]>([]);

	$effect(() => {
		liveActivities = activities;
	});

	onMount(() => {
		const source = new EventSource('/api/activity');
		source.addEventListener('activity', (event) => {
			const next = JSON.parse(event.data) as Activity[];
			liveActivities = next;
		});
		return () => source.close();
	});
</script>

<div class="activity-ticker" aria-label="Live board activity">
	<div>
		{#each liveActivities as activity (activity.id)}
			<a
				href={activity.threadId
					? resolve('/boards/[board]/[threadId]', {
							board: activity.boardCode,
							threadId: String(activity.threadId)
						})
					: resolve('/boards/[board]', { board: activity.boardCode })}
			>
				[{activity.boardCode}] {activity.message}
			</a>
		{/each}
	</div>
</div>
