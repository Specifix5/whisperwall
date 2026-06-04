import { resolve } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import {
	createReply,
	deletePosts,
	deleteThread,
	getActivities,
	getBoard,
	getBoardQuoteLinks,
	getBoards,
	getPostsByIds,
	getThread,
	updatePostsSpoiler,
	updateThreadFlag
} from '$lib/server/imageboard';
import {
	hasStaffCredential,
	optionsHasCommand,
	resolveIdentity,
	resolveTripcodeCredential
} from '$lib/server/identity';
import { getFavoriteBoards } from '$lib/server/favorites';
import { readAttachmentForm } from '$lib/server/attachments';
import { getTurnstileSettings } from '$lib/server/settings';
import {
	assertCanPost,
	getRequestDebugContext,
	getRequestIdentity,
	hardBanPostTarget,
	softBanPostTarget
} from '$lib/server/moderation';
import { consumeTurnstilePass, turnstileTokenFromForm } from '$lib/server/turnstile';
import { opSecretHashFromCookie } from '$lib/server/op-session';

function hasModCredential(form: FormData) {
	const credential = String(form.get('credential') ?? '');
	return hasStaffCredential(credential, 'mod');
}

function hasAdminCredential(form: FormData) {
	const credential = String(form.get('credential') ?? '');
	return hasStaffCredential(credential, 'admin');
}

function postMatchesTripcodeCredential(
	post: { author: string; authorTripcode: string | null },
	credential: { author: string; authorTripcode: string | null }
) {
	return Boolean(
		credential.authorTripcode &&
		post.authorTripcode &&
		post.author === credential.author &&
		post.authorTripcode === credential.authorTripcode
	);
}

function quotedPostIds(body: string) {
	return [...body.matchAll(/>>(\d+)/g)].map((match) => Number(match[1])).filter(Number.isInteger);
}

export async function load({ cookies, params, url }) {
	const board = await getBoard(params.board);
	if (!board) throw redirect(302, resolve('/'));

	const threadId = Number(params.threadId);
	if (!Number.isInteger(threadId)) {
		throw redirect(302, resolve('/boards/[board]', { board: params.board }));
	}

	const isAutoRefresh = url.searchParams.get('ww_autorefresh') === '1';
	const thread = await getThread(params.board, threadId, { incrementViews: !isAutoRefresh });
	if (!thread) throw redirect(302, resolve('/boards/[board]', { board: params.board }));

	const boards = await getBoards();
	const activities = await getActivities();
	const turnstile = await getTurnstileSettings();
	const quoteIds = new Set<number>(quotedPostIds(thread.body));
	for (const reply of thread.replies) {
		quotedPostIds(reply.body).forEach((id) => quoteIds.add(id));
		if (reply.quotePostId) quoteIds.add(reply.quotePostId);
	}
	const externalQuoteHrefs = await getBoardQuoteLinks(params.board, [...quoteIds], threadId);
	return {
		board,
		boards,
		thread,
		externalQuoteHrefs,
		activities,
		turnstile,
		favoriteCodes: getFavoriteBoards(cookies)
	};
}

export const actions = {
	reply: async ({ cookies, getClientAddress, params, request }) => {
		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		const threadId = Number(params.threadId);
		const debug = getRequestDebugContext(request.headers, getClientAddress());
		console.info('[create-reply] request', {
			...debug,
			board: params.board,
			threadId,
			bodyLength: body.length,
			hasTurnstilePass: Boolean(turnstileTokenFromForm(form)),
			hasAttachmentUrl: Boolean(String(form.get('imageUrl') ?? '').trim())
		});
		if (!body) return fail(400, { message: 'Comment is required.' });
		const turnstileSettings = await getTurnstileSettings();
		if (turnstileSettings.posts) {
			const turnstile = await consumeTurnstilePass(
				turnstileTokenFromForm(form),
				getClientAddress()
			);
			if (!turnstile.ok) {
				console.warn('[create-reply] rejected', {
					...debug,
					board: params.board,
					threadId,
					reason: turnstile.message,
					turnstileSettings
				});
				return fail(403, { message: turnstile.message });
			}
		}

		const attachment = readAttachmentForm(form);
		if ('error' in attachment) return fail(400, { message: attachment.error });

		const requestIdentity = await getRequestIdentity({
			cookies,
			headers: request.headers,
			fallbackIp: getClientAddress()
		});
		const permission = await assertCanPost(requestIdentity);
		if (!permission.allowed) {
			console.warn('[create-reply] rejected', {
				...debug,
				board: params.board,
				threadId,
				reason: permission.message,
				ipAddressId: requestIdentity.ipAddressId
			});
			return fail(403, { message: permission.message });
		}

		const options = String(form.get('options') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const thread = await getThread(params.board, threadId, { incrementViews: false });
		if (!thread) return fail(404, { message: 'Thread not found.' });
		const postIdentity = await resolveIdentity(name, options);
		const cookieOpSecretHash = opSecretHashFromCookie(cookies, threadId);
		const isOp = Boolean(
			(postIdentity.authorTripcode &&
				thread.authorTripcode &&
				postIdentity.author === thread.author &&
				postIdentity.authorTripcode === thread.authorTripcode) ||
			(thread.opSecretHash && cookieOpSecretHash && thread.opSecretHash === cookieOpSecretHash)
		);
		const reply = await createReply({
			threadId,
			name,
			options,
			body,
			spoiler: form.get('spoiler') === 'on',
			quotePostId: Number(form.get('quotePostId')) || undefined,
			imageUrl: attachment.imageUrl,
			imageName: attachment.imageName,
			imageOriginalName: attachment.imageOriginalName,
			imageSize: attachment.imageSize,
			imageDimensions: attachment.imageDimensions,
			ipAddressId: requestIdentity.ipAddressId,
			fingerprintHash: requestIdentity.fingerprintHash,
			userAgentHash: requestIdentity.userAgentHash,
			isOp
		});
		console.info('[create-reply] success', {
			...debug,
			board: params.board,
			threadId,
			replyId: reply.id,
			ipAddressId: requestIdentity.ipAddressId
		});

		throw redirect(
			303,
			`${resolve('/boards/[board]/[threadId]', {
				board: params.board,
				threadId: String(threadId)
			})}${optionsHasCommand(options, 'noko') ? `#p${reply.id}` : ''}`
		);
	},
	flag: async ({ params, request }) => {
		const form = await request.formData();
		const threadId = Number(params.threadId);
		const flag = String(form.get('flag'));
		const value = String(form.get('value')) === 'true';
		const thread = await getThread(params.board, threadId, { incrementViews: false });
		if (!thread) return fail(404, { message: 'Thread not found.' });
		if (flag !== 'pinned' && flag !== 'archived') {
			return fail(400, { message: 'Unknown thread flag.' });
		}
		if (!hasModCredential(form)) return fail(403, { message: 'Password required.' });

		await updateThreadFlag(threadId, flag, value, params.board);
		throw redirect(
			303,
			resolve('/boards/[board]/[threadId]', {
				board: params.board,
				threadId: String(threadId)
			})
		);
	},
	moderate: async ({ params, request }) => {
		const form = await request.formData();
		const threadId = Number(params.threadId);
		const command = String(form.get('command') ?? '');
		const isStaff = hasModCredential(form);
		const thread = await getThread(params.board, threadId, { incrementViews: false });
		if (!thread) return fail(404, { message: 'Thread not found.' });

		if (!isStaff && command !== 'delete-thread' && command !== 'delete-selected') {
			return fail(403, { message: 'Password required.' });
		}

		if (command === 'delete-thread') {
			if (!isStaff) {
				const ownerCredential = await resolveTripcodeCredential(
					String(form.get('credential') ?? '').trim()
				);
				if (
					!thread ||
					!ownerCredential ||
					!postMatchesTripcodeCredential(thread, ownerCredential)
				) {
					return fail(403, { message: 'Password does not match the thread tripcode.' });
				}
			}
			await deleteThread(threadId, params.board);
			throw redirect(303, resolve('/boards/[board]', { board: params.board }));
		}

		if (command === 'delete-selected') {
			const includeThread = form.get('includeThread') === 'true';
			const postIds = form
				.getAll('postId')
				.map((value) => Number(value))
				.filter(Number.isInteger);

			if (includeThread) {
				if (!isStaff) {
					const ownerCredential = await resolveTripcodeCredential(
						String(form.get('credential') ?? '').trim()
					);
					if (
						!thread ||
						!ownerCredential ||
						!postMatchesTripcodeCredential(thread, ownerCredential)
					) {
						return fail(403, { message: 'Password does not match the thread tripcode.' });
					}
				}
				await deleteThread(threadId, params.board);
				throw redirect(303, resolve('/boards/[board]', { board: params.board }));
			}

			if (!postIds.length) return fail(400, { message: 'Select at least one post.' });
			if (!isStaff) {
				const ownerCredential = await resolveTripcodeCredential(
					String(form.get('credential') ?? '').trim()
				);
				const selectedPosts = await getPostsByIds(threadId, postIds);
				if (
					!ownerCredential ||
					selectedPosts.length !== new Set(postIds).size ||
					selectedPosts.some((post) => !postMatchesTripcodeCredential(post, ownerCredential))
				) {
					return fail(403, { message: 'Password does not match every selected post tripcode.' });
				}
			}

			const deletedCount = await deletePosts(threadId, postIds);
			return {
				message: `Deleted ${deletedCount} post${deletedCount === 1 ? '' : 's'}.`
			};
		}

		if (command === 'softban-post' || command === 'hardban-post') {
			if (!isStaff) return fail(403, { message: 'Password required.' });
			if (command === 'hardban-post' && !hasAdminCredential(form)) {
				return fail(403, { message: 'Admin password required.' });
			}

			const includeThread = form.get('includeThread') === 'true';
			const postIds = form
				.getAll('postId')
				.map((value) => Number(value))
				.filter(Number.isInteger);
			const target = includeThread
				? { type: 'thread' as const, id: threadId }
				: postIds.length
					? { type: 'post' as const, id: postIds[0] }
					: null;

			if (!target) return fail(400, { message: 'Select a post to ban.' });

			const didBan =
				command === 'hardban-post'
					? await hardBanPostTarget(target, `Banned from /${params.board}/${threadId}`)
					: await softBanPostTarget(target, `Softbanned from /${params.board}/${threadId}`);
			if (!didBan) {
				return fail(400, {
					message:
						command === 'hardban-post'
							? 'Selected post has no logged IP address.'
							: 'Selected post has no logged softban identity. Softban only works on posts made after this fix.'
				});
			}
			return { message: command === 'hardban-post' ? 'Hardban added.' : 'Softban added.' };
		}

		if (command === 'spoiler-selected' || command === 'unspoiler-selected') {
			if (!isStaff) return fail(403, { message: 'Password required.' });
			const includeThread = form.get('includeThread') === 'true';
			const postIds = form
				.getAll('postId')
				.map((value) => Number(value))
				.filter(Number.isInteger);
			if (!includeThread && !postIds.length) {
				return fail(400, { message: 'Select at least one post.' });
			}

			const value = command === 'spoiler-selected';
			if (includeThread) await updateThreadFlag(threadId, 'spoiler', value, params.board);
			const updatedCount = await updatePostsSpoiler(threadId, postIds, value);
			const total = updatedCount + (includeThread ? 1 : 0);
			return {
				message: `${value ? 'Spoilered' : 'Unspoilered'} ${total} post${total === 1 ? '' : 's'}.`
			};
		}

		const flagCommands = new Map<
			string,
			{ flag: 'pinned' | 'archived'; value: boolean; label: string }
		>([
			['pin', { flag: 'pinned', value: true, label: 'Pinned thread.' }],
			['unpin', { flag: 'pinned', value: false, label: 'Unpinned thread.' }],
			['archive', { flag: 'archived', value: true, label: 'Archived thread.' }],
			['unarchive', { flag: 'archived', value: false, label: 'Unarchived thread.' }]
		]);
		const action = flagCommands.get(command);

		if (!action) {
			return fail(400, {
				message:
					'Unknown moderation action. Try Pin, Unpin, Archive, Unarchive, Spoiler, Unspoiler, or Delete Thread.'
			});
		}

		await updateThreadFlag(threadId, action.flag, action.value, params.board);
		return { message: action.label };
	},
	delete: async ({ params, request }) => {
		const form = await request.formData();
		if (!hasModCredential(form)) return fail(403, { message: 'Password required.' });

		await deleteThread(Number(params.threadId), params.board);
		throw redirect(303, resolve('/boards/[board]', { board: params.board }));
	}
};
