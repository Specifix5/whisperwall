import type { Handle, HandleServerError } from '@sveltejs/kit';

function headerValue(headers: Headers, name: string) {
	return headers.get(name) ?? '';
}

export const handle: Handle = async ({ event, resolve }) => {
	const startedAt = Date.now();
	const { request, url } = event;

	console.info('[request] start', {
		method: request.method,
		path: `${url.pathname}${url.search}`,
		origin: headerValue(request.headers, 'origin'),
		referer: headerValue(request.headers, 'referer'),
		secFetchSite: headerValue(request.headers, 'sec-fetch-site'),
		userAgent: headerValue(request.headers, 'user-agent'),
		clientAddress: event.getClientAddress()
	});

	const response = await resolve(event);

	console.info('[request] done', {
		method: request.method,
		path: `${url.pathname}${url.search}`,
		status: response.status,
		durationMs: Date.now() - startedAt
	});

	return response;
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	console.error('[request] error', {
		method: event.request.method,
		path: `${event.url.pathname}${event.url.search}`,
		status,
		message,
		error: error instanceof Error ? error.stack ?? error.message : String(error)
	});
};
