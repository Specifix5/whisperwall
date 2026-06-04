import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { hardBans, ipAddresses, posts, softBans, threads } from '$lib/server/db/schema';

const fingerprintCookie = 'ww_fp';
const fingerprintMaxAge = 60 * 60 * 24 * 365;

type RequestIdentity = {
	ipAddressId: number;
	ipAddress: string;
	fingerprintHash: string;
	userAgentHash: string;
};

type PostTarget = { type: 'thread'; id: number } | { type: 'post'; id: number };

function hash(value: string) {
	return createHash('sha256').update(value).digest('base64url');
}

function normalizeIp(value: string) {
	const trimmed = value.trim();
	if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
	return trimmed;
}

function firstHeaderIp(value: string | null) {
	return value?.split(',')[0]?.trim() || '';
}

export function getForwardedIp(headers: Headers, fallback = '0.0.0.0') {
	return normalizeIp(
		headers.get('cf-connecting-ip') ||
			headers.get('true-client-ip') ||
			headers.get('x-real-ip') ||
			firstHeaderIp(headers.get('x-forwarded-for')) ||
			fallback
	);
}

export function getRequestDebugContext(headers: Headers, fallbackIp = '0.0.0.0') {
	return {
		ipAddress: getForwardedIp(headers, fallbackIp),
		userAgent: headers.get('user-agent') ?? ''
	};
}

function shouldUseSecureCookie(headers: Headers) {
	const forwardedProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
	const cfVisitor = headers.get('cf-visitor') ?? '';
	return forwardedProto === 'https' || cfVisitor.includes('"scheme":"https"');
}

function getFingerprint(cookies: Cookies, secure: boolean) {
	const existing = cookies.get(fingerprintCookie);
	if (existing) return existing;

	const generated = randomBytes(24).toString('base64url');
	cookies.set(fingerprintCookie, generated, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: fingerprintMaxAge
	});
	return generated;
}

async function getOrCreateIpAddress(address: string) {
	const [existing] = await db
		.select()
		.from(ipAddresses)
		.where(eq(ipAddresses.address, address))
		.limit(1);
	if (existing) {
		await db
			.update(ipAddresses)
			.set({ lastSeenAt: new Date() })
			.where(eq(ipAddresses.id, existing.id));
		return existing.id;
	}

	const [created] = await db
		.insert(ipAddresses)
		.values({ address })
		.returning({ id: ipAddresses.id });
	return created.id;
}

export async function getRequestIdentity({
	cookies,
	headers,
	fallbackIp
}: {
	cookies: Cookies;
	headers: Headers;
	fallbackIp?: string;
}): Promise<RequestIdentity> {
	const ipAddress = getForwardedIp(headers, fallbackIp);
	const ipAddressId = await getOrCreateIpAddress(ipAddress);
	const fingerprint = getFingerprint(cookies, shouldUseSecureCookie(headers));
	const userAgent = headers.get('user-agent') ?? '';

	return {
		ipAddressId,
		ipAddress,
		fingerprintHash: hash(fingerprint),
		userAgentHash: hash(userAgent)
	};
}

export async function assertCanPost(identity: RequestIdentity) {
	const now = new Date();

	const [hardBan] = await db
		.select()
		.from(hardBans)
		.where(
			and(
				eq(hardBans.ipAddressId, identity.ipAddressId),
				or(isNull(hardBans.expiresAt), gt(hardBans.expiresAt, now))
			)
		)
		.limit(1);
	if (hardBan) return { allowed: false, message: 'This IP address is banned from posting.' };

	const [softBan] = await db
		.select()
		.from(softBans)
		.where(
			and(
				eq(softBans.ipAddressId, identity.ipAddressId),
				eq(softBans.fingerprintHash, identity.fingerprintHash),
				eq(softBans.userAgentHash, identity.userAgentHash),
				or(isNull(softBans.expiresAt), gt(softBans.expiresAt, now))
			)
		)
		.limit(1);
	if (softBan) return { allowed: false, message: 'This browser is banned from posting.' };

	return { allowed: true, message: '' };
}

async function getTargetIdentity(target: PostTarget) {
	if (target.type === 'thread') {
		const [thread] = await db
			.select({
				ipAddressId: threads.ipAddressId,
				fingerprintHash: threads.fingerprintHash,
				userAgentHash: threads.userAgentHash
			})
			.from(threads)
			.where(eq(threads.id, target.id))
			.limit(1);
		return thread ?? null;
	}

	const [post] = await db
		.select({
			ipAddressId: posts.ipAddressId,
			fingerprintHash: posts.fingerprintHash,
			userAgentHash: posts.userAgentHash
		})
		.from(posts)
		.where(eq(posts.id, target.id))
		.limit(1);
	return post ?? null;
}

async function getTargetIpAddressId(target: PostTarget) {
	return (await getTargetIdentity(target))?.ipAddressId ?? null;
}

export async function hardBanPostTarget(target: PostTarget, reason = '') {
	const ipAddressId = await getTargetIpAddressId(target);
	if (!ipAddressId) return false;

	await db.insert(hardBans).values({ ipAddressId, reason });
	return true;
}

export async function softBanPostTarget(target: PostTarget, reason = '') {
	const identity = await getTargetIdentity(target);
	if (!identity?.ipAddressId || !identity.fingerprintHash || !identity.userAgentHash) return false;

	await db.insert(softBans).values({
		ipAddressId: identity.ipAddressId,
		fingerprintHash: identity.fingerprintHash,
		userAgentHash: identity.userAgentHash,
		reason
	});
	return true;
}
