import { redirect } from '@sveltejs/kit';
import { toggleFavoriteBoard } from '$lib/server/favorites';

export async function POST({ cookies, request }) {
	const form = await request.formData();
	const boardCode = String(form.get('boardCode') ?? '').trim();
	const returnTo = String(form.get('returnTo') ?? '/');

	if (boardCode) toggleFavoriteBoard(cookies, boardCode);

	throw redirect(303, returnTo.startsWith('/') ? returnTo : '/');
}
