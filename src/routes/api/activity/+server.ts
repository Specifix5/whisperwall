import { getActivities } from '$lib/server/imageboard';

export async function GET() {
	const encoder = new TextEncoder();

	let interval: ReturnType<typeof setInterval>;
	let lastSentId = 0;
	let closed = false;
	let sending = false;

	const stream = new ReadableStream({
		async start(controller) {
			controller.enqueue(encoder.encode(': connected\n\n'));

			async function send() {
				if (closed || sending) return;

				sending = true;

				try {
					const activities = await getActivities();

					if (closed) return;

					const latestId = activities[0]?.id ?? 0;

					if (latestId <= lastSentId) {
						controller.enqueue(encoder.encode(': heartbeat\n\n'));
						return;
					}

					lastSentId = latestId;

					controller.enqueue(
						encoder.encode(`event: activity\ndata: ${JSON.stringify(activities)}\n\n`)
					);
				} catch (err) {
					console.error('SSE activity send failed:', err);

					if (!closed) {
						try {
							controller.error(err);
						} catch {
							// controller may already be closed
						}
					}
				} finally {
					sending = false;
				}
			}

			await send();

			if (!closed) {
				interval = setInterval(send, 3000);
			}
		},

		cancel() {
			closed = true;
			clearInterval(interval);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}
