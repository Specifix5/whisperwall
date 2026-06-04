import type { Cookies } from '@sveltejs/kit';

const FAVORITES_COOKIE = 'favorite_boards';

export function getFavoriteBoards(cookies: Cookies) {
	const raw = cookies.get(FAVORITES_COOKIE);
	if (!raw) return [];
	return raw
		.split(',')
		.map((code) => code.trim())
		.filter(Boolean);
}

export function setFavoriteBoards(cookies: Cookies, boards: string[]) {
	cookies.set(FAVORITES_COOKIE, [...new Set(boards)].join(','), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
}

export function toggleFavoriteBoard(cookies: Cookies, boardCode: string) {
	const current = getFavoriteBoards(cookies);
	const next = current.includes(boardCode)
		? current.filter((code) => code !== boardCode)
		: [...current, boardCode];
	setFavoriteBoards(cookies, next);
	return next;
}
