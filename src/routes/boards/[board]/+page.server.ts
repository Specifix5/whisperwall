import { resolve } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import {
	createThread,
	deleteThread,
	getActivities,
	getBoard,
	getBoards,
	getBoardThreads,
	updateThreadFlag
} from '$lib/server/imageboard';
import { getBoardRulesHtml } from '$lib/server/content';
import { getFavoriteBoards } from '$lib/server/favorites';
import { assertCanPost, getRequestDebugContext, getRequestIdentity } from '$lib/server/moderation';
import { readAttachmentForm } from '$lib/server/attachments';
import { hasStaffCredential, optionsHasCommand } from '$lib/server/identity';
import { consumeTurnstilePass, turnstileTokenFromForm } from '$lib/server/turnstile';
import { getTurnstileSettings } from '$lib/server/settings';
import {
	generateOpSecret,
	hashOpSecret,
	hasTripcodeInput,
	setOpSecretCookie
} from '$lib/server/op-session';

export async function load({ cookies, params, url }) {
	const board = await getBoard(params.board);
	if (!board) throw redirect(302, resolve('/'));

	const view = url.searchParams.get('view') ?? 'catalog';
	const search = url.searchParams.get('q') ?? '';
	const layout = url.searchParams.get('layout') === 'grid' ? 'grid' : 'list';
	const rows = await getBoardThreads(params.board, { archived: view === 'archive', search });
	const boards = await getBoards();
	const activities = await getActivities();
	const rulesHtml = view === 'rules' ? await getBoardRulesHtml(params.board) : '';
	const turnstile = await getTurnstileSettings();

	return {
		board,
		boards,
		rows,
		view,
		layout,
		search,
		rulesHtml,
		activities,
		turnstile,
		favoriteCodes: getFavoriteBoards(cookies)
	};
}

export const actions = {
	createThread: async ({ cookies, getClientAddress, params, request }) => {
		const form = await request.formData();
		const subject = String(form.get('subject') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const debug = getRequestDebugContext(request.headers, getClientAddress());
		console.info('[create-thread] request', {
			...debug,
			board: params.board,
			subjectLength: subject.length,
			bodyLength: body.length,
			hasTurnstilePass: Boolean(turnstileTokenFromForm(form)),
			hasAttachmentUrl: Boolean(String(form.get('imageUrl') ?? '').trim())
		});

		if (!subject || !body) return fail(400, { message: 'Subject and comment are required.' });
		const turnstileSettings = await getTurnstileSettings();
		if (turnstileSettings.posts) {
			const turnstile = await consumeTurnstilePass(
				turnstileTokenFromForm(form),
				getClientAddress()
			);
			if (!turnstile.ok) {
				console.warn('[create-thread] rejected', {
					...debug,
					board: params.board,
					reason: turnstile.message,
					turnstileSettings
				});
				return fail(403, { message: turnstile.message });
			}
		}

		const attachment = readAttachmentForm(form);
		if ('error' in attachment) return fail(400, { message: attachment.error });

		const identity = await getRequestIdentity({
			cookies,
			headers: request.headers,
			fallbackIp: getClientAddress()
		});
		const permission = await assertCanPost(identity);
		if (!permission.allowed) {
			console.warn('[create-thread] rejected', {
				...debug,
				board: params.board,
				reason: permission.message,
				ipAddressId: identity.ipAddressId
			});
			return fail(403, { message: permission.message });
		}

		const name = String(form.get('name') ?? '').trim();
		const options = String(form.get('options') ?? '').trim();
		const opSecret = hasTripcodeInput(name, options) ? '' : generateOpSecret();
		const thread = await createThread({
			boardCode: params.board,
			name,
			options,
			subject,
			body,
			spoiler: form.get('spoiler') === 'on',
			imageUrl: attachment.imageUrl,
			imageName: attachment.imageName,
			imageOriginalName: attachment.imageOriginalName,
			imageSize: attachment.imageSize,
			imageDimensions: attachment.imageDimensions,
			ipAddressId: identity.ipAddressId,
			fingerprintHash: identity.fingerprintHash,
			userAgentHash: identity.userAgentHash,
			opSecretHash: opSecret ? hashOpSecret(opSecret) : undefined
		});
		if (opSecret) setOpSecretCookie(cookies, thread.id, opSecret);
		console.info('[create-thread] success', {
			...debug,
			board: params.board,
			threadId: thread.id,
			ipAddressId: identity.ipAddressId
		});

		throw redirect(
			303,
			`${resolve('/boards/[board]/[threadId]', {
				board: params.board,
				threadId: String(thread.id)
			})}${optionsHasCommand(options, 'noko') ? `#t${thread.id}` : ''}`
		);
	},
	moderateSelected: async ({ params, request }) => {
		const form = await request.formData();
		const ids = form
			.getAll('threadId')
			.map((value) => Number(value))
			.filter(Number.isInteger);
		const command = String(form.get('command'));

		if (!ids.length) return fail(400, { message: 'Select at least one thread.' });
		if (!hasStaffCredential(String(form.get('credential') ?? ''), 'mod')) {
			return fail(403, { message: 'Password required.' });
		}

		if (command === 'pin-selected' || command === 'archive-selected') {
			const flag = command === 'pin-selected' ? 'pinned' : 'archived';
			await Promise.all(ids.map((id) => updateThreadFlag(id, flag, true, params.board)));
			return { message: `Updated ${ids.length} thread${ids.length === 1 ? '' : 's'}.` };
		}

		if (command === 'spoiler-selected' || command === 'unspoiler-selected') {
			await Promise.all(
				ids.map((id) =>
					updateThreadFlag(id, 'spoiler', command === 'spoiler-selected', params.board)
				)
			);
			return {
				message: `${command === 'spoiler-selected' ? 'Spoilered' : 'Unspoilered'} ${ids.length} thread${ids.length === 1 ? '' : 's'}.`
			};
		}

		if (command === 'delete-selected') {
			await Promise.all(ids.map((id) => deleteThread(id, params.board)));
			return { message: `Deleted ${ids.length} thread${ids.length === 1 ? '' : 's'}.` };
		}

		return fail(400, { message: 'Unknown moderation action.' });
	}
};
