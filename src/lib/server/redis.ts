import net from 'node:net';
import { appEnv } from '$lib/server/config';

const timeoutMs = 500;

function encodeCommand(parts: string[]) {
	return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
}

function readBulkString(response: string) {
	if (response.startsWith('$-1')) return null;
	if (!response.startsWith('$')) return null;

	const separator = response.indexOf('\r\n');
	const length = Number(response.slice(1, separator));
	if (!Number.isInteger(length) || length < 0) return null;
	return response.slice(separator + 2, separator + 2 + length);
}

function authCommand(url: URL) {
	if (!url.password) return null;
	const username = decodeURIComponent(url.username);
	const password = decodeURIComponent(url.password);
	return username ? ['AUTH', username, password] : ['AUTH', password];
}

function redisUrl() {
	try {
		return new URL(appEnv.REDIS_URL);
	} catch {
		return null;
	}
}

async function sendRedisCommand(parts: string[]) {
	const url = redisUrl();
	if (!url) return null;
	const auth = authCommand(url);

	return new Promise<string | null>((resolve) => {
		const socket = net.createConnection({
			host: url.hostname,
			port: Number(url.port || 6379)
		});
		let settled = false;
		let response = '';
		let authed = !auth;

		const finish = (value: string | null) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(value);
		};

		socket.setTimeout(timeoutMs);
		socket.once('error', () => finish(null));
		socket.once('timeout', () => finish(null));
		socket.on('data', (chunk) => {
			response += chunk.toString('utf8');

			if (!authed) {
				if (response.startsWith('+OK')) {
					authed = true;
					response = '';
					socket.write(encodeCommand(parts));
					return;
				}

				if (response.startsWith('-')) {
					finish(null);
				}

				return;
			}

			finish(response);
		});
		socket.once('connect', () => {
			socket.write(encodeCommand(auth ?? parts));
		});
	});
}

export async function redisGet(key: string) {
	const response = await sendRedisCommand(['GET', key]);
	return response ? readBulkString(response) : null;
}

export async function redisSetJson(key: string, value: unknown, ttlSeconds: number) {
	await sendRedisCommand(['SETEX', key, String(ttlSeconds), JSON.stringify(value)]);
}

export async function redisDel(key: string) {
	await sendRedisCommand(['DEL', key]);
}
