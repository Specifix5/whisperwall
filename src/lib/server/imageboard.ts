import { and, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { boards, posts, threads } from '$lib/server/db/schema';
import { ensureTripcodeSalt, resolveIdentity } from '$lib/server/identity';
import { redisGet, redisSetJson } from '$lib/server/redis';
import { getBoardBanners, getSettings } from '$lib/server/settings';

type ThreadInput = {
	boardCode: string;
	name: string;
	options?: string;
	subject: string;
	body: string;
	spoiler?: boolean;
	imageUrl?: string;
	imageName?: string;
	imageOriginalName?: string;
	imageSize?: string;
	imageDimensions?: string;
	ipAddressId?: number;
	fingerprintHash?: string;
	userAgentHash?: string;
	opSecretHash?: string;
};

type ReplyInput = {
	threadId: number;
	name: string;
	options?: string;
	body: string;
	spoiler?: boolean;
	quotePostId?: number;
	imageUrl?: string;
	imageName?: string;
	imageOriginalName?: string;
	imageSize?: string;
	imageDimensions?: string;
	ipAddressId?: number;
	fingerprintHash?: string;
	userAgentHash?: string;
	isOp?: boolean;
};

type Activity = {
	id: number;
	kind: string;
	boardCode: string;
	threadId: number | null;
	message: string;
	createdAt: string;
};

const activityCacheKey = 'whisperwall:activities';
const activityTtlSeconds = 60;
let boardSyncPromise: Promise<void> | null = null;

function threadPath(boardCode: string, threadId: number) {
	return `/boards/${encodeURIComponent(boardCode)}/${threadId}`;
}

function sortBoardsBySettingsOrder(rows: (typeof boards.$inferSelect)[], codes: string[]) {
	const order = new Map(codes.map((code, index) => [code, index]));
	return [...rows].sort((a, b) => {
		const category = a.category.localeCompare(b.category);
		if (category) return category;
		return (
			(order.get(a.code) ?? Number.MAX_SAFE_INTEGER) -
			(order.get(b.code) ?? Number.MAX_SAFE_INTEGER)
		);
	});
}

function pickBanner(banners: string[]) {
	if (!banners.length) return '';
	return banners[Math.floor(Math.random() * banners.length)] ?? '';
}

async function addBoardBanners<T extends typeof boards.$inferSelect>(board: T) {
	const banners = await getBoardBanners(board.code);
	return { ...board, banners, bannerUrl: pickBanner(banners) };
}

async function getConfiguredBoardCodes() {
	const settings = await getSettings();
	return settings.boards?.map((board) => board.code) ?? [];
}

export async function ensureConfiguredBoards() {
	boardSyncPromise ??= (async () => {
		const settings = await getSettings();
		await ensureTripcodeSalt();
		if (!settings.boards?.length) return;
		const configuredBoards = settings.boards.map(({ ...board }) => board);

		await db
			.insert(boards)
			.values(configuredBoards)
			.onConflictDoUpdate({
				target: boards.code,
				set: {
					name: sql`excluded.name`,
					category: sql`excluded.category`,
					color: sql`excluded.color`,
					description: sql`excluded.description`
				}
			});
	})();

	return boardSyncPromise;
}

export async function getBoards() {
	await ensureConfiguredBoards();
	const codes = await getConfiguredBoardCodes();
	if (!codes.length) return [];

	const rows = await db.select().from(boards).where(inArray(boards.code, codes));
	return sortBoardsBySettingsOrder(rows, codes);
}

export async function getBoard(code: string) {
	await ensureConfiguredBoards();
	const codes = await getConfiguredBoardCodes();
	if (!codes.includes(code)) return null;

	const [board] = await db.select().from(boards).where(eq(boards.code, code)).limit(1);
	return board ? addBoardBanners(board) : null;
}

export async function getBoardThreads(
	boardCode: string,
	options: { archived?: boolean; search?: string } = {}
) {
	await ensureConfiguredBoards();
	const codes = await getConfiguredBoardCodes();
	if (!codes.includes(boardCode)) return [];

	const conditions = [
		eq(threads.boardCode, boardCode),
		eq(threads.archived, Boolean(options.archived))
	];
	if (options.search) conditions.push(ilike(threads.subject, `%${options.search}%`));

	const rows = await db
		.select({
			thread: threads,
			replyCount: count(posts.id),
			imageCount: sql<number>`cast((${count(posts.imageUrl)} + case when ${threads.imageUrl} is null then 0 else 1 end) as int)`
		})
		.from(threads)
		.leftJoin(posts, eq(posts.threadId, threads.id))
		.where(and(...conditions))
		.groupBy(threads.id)
		.orderBy(desc(threads.pinned), desc(threads.updatedAt));

	return rows;
}

export async function getThread(
	boardCode: string,
	threadId: number,
	options: { incrementViews?: boolean } = {}
) {
	await ensureConfiguredBoards();
	const codes = await getConfiguredBoardCodes();
	if (!codes.includes(boardCode)) return null;

	const [thread] = await db
		.select()
		.from(threads)
		.where(and(eq(threads.boardCode, boardCode), eq(threads.id, threadId)))
		.limit(1);
	if (!thread) return null;

	if (options.incrementViews !== false) {
		await db
			.update(threads)
			.set({ views: thread.views + 1 })
			.where(eq(threads.id, thread.id));
	}

	const replies = await db
		.select()
		.from(posts)
		.where(eq(posts.threadId, thread.id))
		.orderBy(posts.createdAt);
	return {
		...thread,
		views: options.incrementViews === false ? thread.views : thread.views + 1,
		replies
	};
}

export async function getLandingData() {
	await ensureConfiguredBoards();
	const allBoards = await getBoards();
	const codes = allBoards.map((board) => board.code);
	const recentThreadRows = codes.length
		? await db
				.select()
				.from(threads)
				.where(inArray(threads.boardCode, codes))
				.orderBy(desc(threads.updatedAt))
				.limit(6)
		: [];
	const recentThreads = await Promise.all(
		recentThreadRows.map(async (thread) => {
			const [latestReply] = await db
				.select({ body: posts.body })
				.from(posts)
				.where(eq(posts.threadId, thread.id))
				.orderBy(desc(posts.createdAt))
				.limit(1);
			return { ...thread, latestText: latestReply?.body ?? thread.body };
		})
	);
	const recentThreadImages = codes.length
		? await db
				.select({
					id: threads.id,
					threadId: threads.id,
					boardCode: threads.boardCode,
					imageUrl: threads.imageUrl,
					imageName: threads.imageName,
					subject: threads.subject,
					body: threads.body,
					spoiler: threads.spoiler,
					createdAt: threads.createdAt
				})
				.from(threads)
				.where(and(inArray(threads.boardCode, codes), sql`${threads.imageUrl} is not null`))
				.orderBy(desc(threads.createdAt))
				.limit(8)
		: [];
	const recentReplyImages = codes.length
		? await db
				.select({
					id: posts.id,
					threadId: posts.threadId,
					boardCode: threads.boardCode,
					imageUrl: posts.imageUrl,
					imageName: posts.imageName,
					subject: threads.subject,
					body: posts.body,
					spoiler: posts.spoiler,
					createdAt: posts.createdAt
				})
				.from(posts)
				.innerJoin(threads, eq(posts.threadId, threads.id))
				.where(and(inArray(threads.boardCode, codes), sql`${posts.imageUrl} is not null`))
				.orderBy(desc(posts.createdAt))
				.limit(8)
		: [];
	const recentImages = [...recentThreadImages, ...recentReplyImages]
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		.slice(0, 8);
	const [{ value: threadCount }] = codes.length
		? await db.select({ value: count() }).from(threads).where(inArray(threads.boardCode, codes))
		: [{ value: 0 }];
	const [{ value: postCount }] = codes.length
		? await db
				.select({ value: count(posts.id) })
				.from(posts)
				.innerJoin(threads, eq(posts.threadId, threads.id))
				.where(inArray(threads.boardCode, codes))
		: [{ value: 0 }];
	const [{ value: uniquePosterCount }] = codes.length
		? await db
				.select({
					value: sql<number>`cast(count(distinct poster_hash) as int)`
				})
				.from(
					sql`(
						select ${threads.fingerprintHash} as poster_hash
						from ${threads}
						where ${threads.boardCode} in ${codes}
							and ${threads.fingerprintHash} is not null
						union
						select ${posts.fingerprintHash} as poster_hash
						from ${posts}
						inner join ${threads} on ${posts.threadId} = ${threads.id}
						where ${threads.boardCode} in ${codes}
							and ${posts.fingerprintHash} is not null
					) poster_fingerprints`
				)
		: [{ value: 0 }];
	const latestActivities = await getActivities();
	return {
		boards: allBoards,
		recentImages,
		recentThreads,
		threadCount,
		postCount,
		uniquePosterCount,
		activities: latestActivities
	};
}

export async function createThread(input: ThreadInput) {
	const identity = await resolveIdentity(input.name, input.options);
	const [thread] = await db
		.insert(threads)
		.values({
			boardCode: input.boardCode,
			author: identity.author,
			authorTripcode: identity.authorTripcode,
			capcode: identity.capcode,
			opSecretHash: input.opSecretHash || null,
			subject: input.subject,
			body: input.body,
			spoiler: Boolean(input.spoiler),
			imageUrl: input.imageUrl || null,
			imageName: input.imageName || null,
			imageOriginalName: input.imageOriginalName || null,
			imageSize: input.imageSize || 'remote',
			imageDimensions: input.imageDimensions || 'unknown',
			ipAddressId: input.ipAddressId,
			fingerprintHash: input.fingerprintHash,
			userAgentHash: input.userAgentHash
		})
		.returning();

	await recordActivity(
		'thread',
		input.boardCode,
		thread.id,
		`New thread on /${input.boardCode}/: ${thread.subject}`
	);
	return thread;
}

export async function createReply(input: ReplyInput) {
	const bodyQuotePostId = Number(input.body.match(/>>(\d+)/)?.[1]) || undefined;
	const quotedPostId = input.quotePostId ?? bodyQuotePostId;
	const identity = await resolveIdentity(input.name, input.options);
	const [reply] = await db
		.insert(posts)
		.values({
			threadId: input.threadId,
			author: identity.author,
			authorTripcode: identity.authorTripcode,
			capcode: identity.capcode,
			isOp: Boolean(input.isOp),
			body: input.body,
			spoiler: Boolean(input.spoiler),
			quotePostId: quotedPostId,
			imageUrl: input.imageUrl || null,
			imageName: input.imageName || null,
			imageOriginalName: input.imageOriginalName || null,
			imageSize: input.imageSize || 'remote',
			imageDimensions: input.imageDimensions || 'unknown',
			ipAddressId: input.ipAddressId,
			fingerprintHash: input.fingerprintHash,
			userAgentHash: input.userAgentHash
		})
		.returning();

	const [thread] = await db.select().from(threads).where(eq(threads.id, input.threadId)).limit(1);
	if (thread) {
		await db
			.update(threads)
			.set({ updatedAt: new Date(), archived: false })
			.where(eq(threads.id, input.threadId));
		await recordActivity(
			'reply',
			thread.boardCode,
			thread.id,
			`New reply on /${thread.boardCode}/${thread.id}.`
		);
	}

	return reply;
}

export async function updateThreadFlag(
	threadId: number,
	flag: 'pinned' | 'archived' | 'spoiler',
	value: boolean,
	boardCode?: string
) {
	const conditions = [eq(threads.id, threadId)];
	if (boardCode) conditions.push(eq(threads.boardCode, boardCode));

	await db
		.update(threads)
		.set({ [flag]: value })
		.where(and(...conditions));
}

export async function updatePostsSpoiler(threadId: number, postIds: number[], value: boolean) {
	const ids = [...new Set(postIds)].filter(Number.isInteger);
	if (!ids.length) return 0;

	const updated = await db
		.update(posts)
		.set({ spoiler: value })
		.where(and(eq(posts.threadId, threadId), inArray(posts.id, ids)))
		.returning({ id: posts.id });

	return updated.length;
}

export async function getPostsByIds(threadId: number, postIds: number[]) {
	const ids = [...new Set(postIds)].filter(Number.isInteger);
	if (!ids.length) return [];

	return db
		.select()
		.from(posts)
		.where(and(eq(posts.threadId, threadId), inArray(posts.id, ids)));
}

export async function getBoardQuoteLinks(
	boardCode: string,
	ids: number[],
	currentThreadId: number
) {
	const quoteIds = [...new Set(ids)].filter(Number.isInteger);
	if (!quoteIds.length) return {};

	const links: Record<number, string> = {};

	const externalThreads = await db
		.select({ id: threads.id })
		.from(threads)
		.where(
			and(
				eq(threads.boardCode, boardCode),
				inArray(threads.id, quoteIds),
				sql`${threads.id} <> ${currentThreadId}`
			)
		);
	for (const thread of externalThreads) {
		links[thread.id] = threadPath(boardCode, thread.id);
	}

	const externalPosts = await db
		.select({ id: posts.id, threadId: posts.threadId })
		.from(posts)
		.innerJoin(threads, eq(posts.threadId, threads.id))
		.where(
			and(
				eq(threads.boardCode, boardCode),
				inArray(posts.id, quoteIds),
				sql`${posts.threadId} <> ${currentThreadId}`
			)
		);
	for (const post of externalPosts) {
		links[post.id] = `${threadPath(boardCode, post.threadId)}#p${post.id}`;
	}

	return links;
}

export async function deleteThread(threadId: number, boardCode?: string) {
	const conditions = [eq(threads.id, threadId)];
	if (boardCode) conditions.push(eq(threads.boardCode, boardCode));
	await db.delete(threads).where(and(...conditions));
}

export async function deletePosts(threadId: number, postIds: number[]) {
	const ids = [...new Set(postIds)].filter(Number.isInteger);
	if (!ids.length) return 0;

	const deleted = await db
		.delete(posts)
		.where(and(eq(posts.threadId, threadId), inArray(posts.id, ids)))
		.returning({ id: posts.id });

	return deleted.length;
}

export async function getActivities(limit = 12) {
	const cached = await redisGet(activityCacheKey);
	if (!cached) return [];

	try {
		const rows = JSON.parse(cached) as Activity[];
		return rows.slice(0, limit);
	} catch {
		return [];
	}
}

export async function recordActivity(
	kind: string,
	boardCode: string,
	threadId: number | null,
	message: string
) {
	const activities = await getActivities(12);
	const next: Activity = {
		id: Date.now(),
		kind,
		boardCode,
		threadId,
		message,
		createdAt: new Date().toISOString()
	};
	await redisSetJson(activityCacheKey, [next, ...activities].slice(0, 12), activityTtlSeconds);
}
