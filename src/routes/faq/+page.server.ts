import { getFaqHtml } from '$lib/server/content';
import { getFavoriteBoards } from '$lib/server/favorites';
import { getActivities, getBoards } from '$lib/server/imageboard';

export async function load({ cookies }) {
	const [boards, activities, faqHtml] = await Promise.all([
		getBoards(),
		getActivities(),
		getFaqHtml()
	]);

	return {
		boards,
		activities,
		faqHtml,
		favoriteCodes: getFavoriteBoards(cookies)
	};
}
