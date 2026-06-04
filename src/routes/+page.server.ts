import { getLandingData } from '$lib/server/imageboard';
import { getFavoriteBoards } from '$lib/server/favorites';

export async function load({ cookies }) {
	return { ...(await getLandingData()), favoriteCodes: getFavoriteBoards(cookies) };
}
