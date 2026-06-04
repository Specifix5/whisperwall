import { getBlotterHtml } from '$lib/server/content';
import { getFavoriteBoards } from '$lib/server/favorites';
import { getActivities, getBoards } from '$lib/server/imageboard';

export async function load({ cookies }) {
	const [boards, activities, blotterHtml] = await Promise.all([
		getBoards(),
		getActivities(),
		getBlotterHtml()
	]);

	return {
		boards,
		activities,
		blotterHtml,
		favoriteCodes: getFavoriteBoards(cookies)
	};
}
