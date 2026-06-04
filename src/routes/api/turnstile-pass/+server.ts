import { json } from '@sveltejs/kit';
import { createTurnstilePass, turnstileEnabled } from '$lib/server/turnstile';

export async function POST({ getClientAddress, request }) {
	if (!(await turnstileEnabled('any'))) {
		console.info('[turnstile-pass] bypassed', { remoteIp: getClientAddress() });
		return json({ pass: '' });
	}

	const form = await request.formData();
	const token = String(form.get('cf-turnstile-response') ?? '').trim();
	console.info('[turnstile-pass] requested', {
		remoteIp: getClientAddress(),
		hasToken: Boolean(token)
	});
	const result = await createTurnstilePass(token, getClientAddress());

	if (!result.ok || !('pass' in result)) {
		return json(
			{ message: 'message' in result ? result.message : 'Captcha failed.' },
			{ status: 403 }
		);
	}

	return json({ pass: result.pass });
}
