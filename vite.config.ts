import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

function parsePort(value: string | undefined) {
	if (!value) return undefined;

	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid APP_PORT/PORT value: ${value}`);
	}

	return port;
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const port = parsePort(env.APP_PORT ?? env.PORT);
	const host = env.HOST || undefined;

	return {
		plugins: [sveltekit()],
		ssr: {
			external: ['bun', 'drizzle-orm/bun-sql']
		},
		server: {
			host,
			port
		},
		preview: {
			host,
			port
		}
	};
});
