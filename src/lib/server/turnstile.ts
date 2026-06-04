import { randomBytes } from 'node:crypto';
import { appEnv } from '$lib/server/config';
import { redisDel, redisGet, redisSetJson } from '$lib/server/redis';
import { getTurnstileSettings } from '$lib/server/settings';

type TurnstileResponse = {
	success?: boolean;
	'error-codes'?: string[];
};

const passPrefix = 'whisperwall:turnstile-pass:';
const passTtlSeconds = 90;
const maxPassUses = 2;

type TurnstilePass = {
	uses: number;
	remoteIp: string;
};

export async function turnstileEnabled(scope: 'posts' | 'uploads' | 'any' = 'any') {
	if (!appEnv.TURNSTILE_SECRET_KEY) return false;

	const settings = await getTurnstileSettings();
	if (scope === 'any') return settings.posts || settings.uploads;
	return settings[scope];
}

export async function verifyTurnstileToken(token: string, remoteIp?: string) {
	if (!(await turnstileEnabled('any'))) {
		console.info('[turnstile] verify bypassed', { remoteIp, reason: 'disabled-in-settings-or-env' });
		return { ok: true };
	}
	const secret = appEnv.TURNSTILE_SECRET_KEY;
	if (!secret) return { ok: true };
	if (!token) {
		console.warn('[turnstile] verify rejected', { remoteIp, reason: 'missing-token' });
		return { ok: false, message: 'Turnstile check is required.' };
	}

	const body = new URLSearchParams({
		secret,
		response: token
	});
	if (remoteIp) body.set('remoteip', remoteIp);

	try {
		const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body
		});

		if (!response.ok) {
			console.warn('[turnstile] verify rejected', {
				remoteIp,
				reason: 'cloudflare-http-failure',
				status: response.status
			});
			return { ok: false, message: 'Turnstile verification failed.' };
		}

		const result = (await response.json()) as TurnstileResponse;
		if (!result.success) {
			console.warn('[turnstile] verify rejected', {
				remoteIp,
				reason: 'cloudflare-unsuccessful',
				errorCodes: result['error-codes'] ?? []
			});
			return { ok: false, message: 'Turnstile check failed. Please try again.' };
		}

		console.info('[turnstile] verify ok', { remoteIp });
		return { ok: true };
	} catch {
		console.error('[turnstile] verify error', {
			remoteIp,
			reason: 'fetch-threw'
		});
		return { ok: false, message: 'Turnstile verification is unavailable. Please try again.' };
	}
}

export async function createTurnstilePass(token: string, remoteIp = '') {
	if (!(await turnstileEnabled('any'))) {
		console.info('[turnstile] pass bypassed', { remoteIp, reason: 'disabled-in-settings-or-env' });
		return { ok: true, pass: '' };
	}
	const verified = await verifyTurnstileToken(token, remoteIp);
	if (!verified.ok) return verified;

	const pass = randomBytes(24).toString('base64url');
	await redisSetJson(
		`${passPrefix}${pass}`,
		{ uses: 0, remoteIp } satisfies TurnstilePass,
		passTtlSeconds
	);
	console.info('[turnstile] pass minted', { remoteIp, usesRemaining: maxPassUses });
	return { ok: true, pass };
}

export async function consumeTurnstilePass(pass: string, remoteIp = '') {
	if (!(await turnstileEnabled('any'))) {
		console.info('[turnstile] consume bypassed', { remoteIp, reason: 'disabled-in-settings-or-env' });
		return { ok: true };
	}
	if (!pass) {
		console.warn('[turnstile] consume rejected', { remoteIp, reason: 'missing-pass' });
		return { ok: false, message: 'Captcha check is required.' };
	}

	const key = `${passPrefix}${pass}`;
	const raw = await redisGet(key);
	if (!raw) {
		console.warn('[turnstile] consume rejected', { remoteIp, reason: 'missing-or-expired-pass' });
		return { ok: false, message: 'Captcha expired. Please get a new one.' };
	}

	try {
		const state = JSON.parse(raw) as TurnstilePass;
		if (state.remoteIp && remoteIp && state.remoteIp !== remoteIp) {
			await redisDel(key);
			console.warn('[turnstile] consume rejected', {
				remoteIp,
				reason: 'ip-mismatch',
				passRemoteIp: state.remoteIp
			});
			return { ok: false, message: 'Captcha check does not match this connection.' };
		}

		const nextUses = state.uses + 1;
		if (nextUses >= maxPassUses) {
			await redisDel(key);
		} else {
			await redisSetJson(key, { ...state, uses: nextUses }, passTtlSeconds);
		}
		console.info('[turnstile] consume ok', {
			remoteIp,
			usesConsumed: nextUses,
			exhausted: nextUses >= maxPassUses
		});
		return { ok: true };
	} catch {
		await redisDel(key);
		console.warn('[turnstile] consume rejected', { remoteIp, reason: 'invalid-pass-payload' });
		return { ok: false, message: 'Captcha expired. Please get a new one.' };
	}
}

export function turnstileTokenFromForm(form: FormData) {
	return String(form.get('turnstilePass') ?? '').trim();
}
