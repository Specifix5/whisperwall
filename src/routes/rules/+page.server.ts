import { getGlobalRulesHtml } from '$lib/server/content';
import { getFavoriteBoards } from '$lib/server/favorites';
import { getActivities, getBoards } from '$lib/server/imageboard';

export async function load({ cookies }) {
	const [boards, activities, rulesHtml] = await Promise.all([
		getBoards(),
		getActivities(),
		getGlobalRulesHtml()
	]);

	return {
		boards,
		activities,
		rulesHtml,
		favoriteCodes: getFavoriteBoards(cookies)
	};
}
