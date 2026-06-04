import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const BoardSettingSchema = z.object({
	code: z.string().min(1),
	name: z.string().min(1),
	category: z.string().min(1),
	color: z.string().regex(/^#[0-9a-f]{6}$/i),
	description: z.string(),
	banners: z.array(z.string().min(1)).default([])
});

const AppSettingsSchema = z.object({
	turnstile: z
		.object({
			posts: z.boolean().default(true),
			uploads: z.boolean().default(true)
		})
		.default({ posts: true, uploads: true }),
	boards: z.array(BoardSettingSchema).default([])
});

type AppSettings = z.infer<typeof AppSettingsSchema>;

const settingsPath = path.join(process.cwd(), 'settings.json');
let settingsPromise: Promise<AppSettings> | null = null;
const isProduction = process.env.NODE_ENV === 'production';

async function readSettings() {
	const raw = await readFile(settingsPath, 'utf8');
	const parsed = AppSettingsSchema.safeParse(JSON.parse(raw));
	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
		throw new Error(`Invalid settings.json:\n${issues.join('\n')}`);
	}

	return parsed.data;
}

export function getSettings() {
	if (!isProduction) return readSettings();
	settingsPromise ??= readSettings();
	return settingsPromise;
}

export async function getBoardBanners(code: string) {
	const settings = await getSettings();
	return settings.boards.find((board) => board.code === code)?.banners ?? [];
}

export async function getTurnstileSettings() {
	const settings = await getSettings();
	return settings.turnstile;
}
