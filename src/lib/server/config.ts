import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { z } from 'zod';

const EnvSchema = z
	.object({
		DATABASE_URL: z.string().url(),
		REDIS_URL: z.string().url().default('redis://localhost:6379'),
		MOD_CREDENTIAL: z.string().min(1),
		ADMIN_CREDENTIAL: z.string().min(1),
		TRIPCODE_SALT: z.string().min(32),
		TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
		MIKU_BASE_URL: z.string().url().optional(),
		MIKU_URL: z.string().url().optional(),
		MIKU_TOKEN: z.string().min(1),
		CDN_URL: z.string().url()
	})
	.refine((value) => value.MIKU_BASE_URL || value.MIKU_URL, {
		message: 'MIKU_BASE_URL or MIKU_URL is required',
		path: ['MIKU_BASE_URL']
	});

function withTrailingSlash(value: string) {
	return value.endsWith('/') ? value : `${value}/`;
}

function parseAppEnv() {
	const parsed = EnvSchema.safeParse(env);

	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
		throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
	}

	return {
		...parsed.data,
		MIKU_BASE_URL: withTrailingSlash(parsed.data.MIKU_BASE_URL ?? parsed.data.MIKU_URL!),
		CDN_URL: withTrailingSlash(parsed.data.CDN_URL)
	};
}

const fallbackEnv = {
	DATABASE_URL: env.DATABASE_URL ?? 'postgres://whisperwall:whisperwall@localhost:5432/whisperwall',
	REDIS_URL: env.REDIS_URL ?? 'redis://localhost:6379',
	MOD_CREDENTIAL: env.MOD_CREDENTIAL ?? 'build-only-mod',
	ADMIN_CREDENTIAL: env.ADMIN_CREDENTIAL ?? 'build-only-admin',
	TRIPCODE_SALT: env.TRIPCODE_SALT ?? 'build-only-tripcode-salt-please-set-env',
	TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
	MIKU_BASE_URL: withTrailingSlash(
		env.MIKU_BASE_URL ?? env.MIKU_URL ?? 'https://miku.hatsune.lol/'
	),
	MIKU_TOKEN: env.MIKU_TOKEN ?? 'build-only-token',
	CDN_URL: withTrailingSlash(env.CDN_URL ?? 'https://miku.hatsune.lol/')
};

export const appEnv = building ? fallbackEnv : parseAppEnv();
