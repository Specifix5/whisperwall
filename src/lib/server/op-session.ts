import { createHmac, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { appEnv } from '$lib/server/config';

const cookiePrefix = 'ww_op_';
const maxAge = 60 * 60 * 24 * 180;

function cookieName(threadId: number) {
	return `${cookiePrefix}${threadId}`;
}

export function hasTripcodeInput(name: string, options = '') {
	const hasNameTrip = name.includes('#') && Boolean(name.split('#').slice(1).join('#').trim());
	const normalizedOptions = options
		.trim()
		.split(/\s+/)
		.filter((option) => option.toLowerCase() !== 'noko')
		.join(' ');
	const hasOptionTrip = /^#.+/.test(normalizedOptions);
	return hasNameTrip || hasOptionTrip;
}

export function generateOpSecret() {
	return randomBytes(32).toString('base64url');
}

export function hashOpSecret(secret: string) {
	return createHmac('sha256', appEnv.TRIPCODE_SALT).update(secret).digest('base64url');
}

export function setOpSecretCookie(cookies: Cookies, threadId: number, secret: string) {
	cookies.set(cookieName(threadId), secret, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge
	});
}

export function opSecretHashFromCookie(cookies: Cookies, threadId: number) {
	const secret = cookies.get(cookieName(threadId));
	return secret ? hashOpSecret(secret) : '';
}
