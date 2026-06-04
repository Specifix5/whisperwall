import { json } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { appEnv } from '$lib/server/config';
import { getRequestDebugContext } from '$lib/server/moderation';
import { consumeTurnstilePass } from '$lib/server/turnstile';
import { getTurnstileSettings } from '$lib/server/settings';

const maxUploadBytes = 8 * 1024 * 1024;
const imageTypes = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif',
	'image/avif'
]);
const passthroughTypes = new Set(['video/webm']);
const allowedTypes = new Set([...imageTypes, 'image/webp', ...passthroughTypes]);
const uploadableRequestTypes = new Set([
	...allowedTypes,
	'application/octet-stream',
	'binary/octet-stream'
]);

function extensionForType(type: string) {
	switch (type) {
		case 'image/jpeg':
			return 'jpg';
		case 'image/png':
			return 'png';
		case 'image/webp':
			return 'webp';
		case 'image/gif':
			return 'gif';
		case 'image/heic':
		case 'image/heif':
			return 'heic';
		case 'image/avif':
			return 'avif';
		case 'video/webm':
			return 'webm';
		default:
			return 'bin';
	}
}

function randomFilename(type: string) {
	return `${randomBytes(18).toString('base64url')}.${extensionForType(type)}`;
}

function sniffAllowedType(bytes: Uint8Array) {
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

	const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
		(value, index) => bytes[index] === value
	);
	if (isPng) return 'image/png';

	const isGif =
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61;
	if (isGif) return 'image/gif';

	const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
	const isWebp =
		isRiff && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
	if (isWebp) return 'image/webp';

	if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
		return 'video/webm';

	const brand = String.fromCharCode(...bytes.slice(8, 12));
	const isIsoBaseMedia =
		bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
	if (isIsoBaseMedia && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
		return 'image/heif';
	}
	if (isIsoBaseMedia && brand === 'avif') return 'image/avif';

	return null;
}

function cdnUrl(filename: string, originalFilename: string) {
	const url = new URL(filename.replace(/^\/+/, ''), appEnv.CDN_URL);
	url.searchParams.set('fn', originalFilename);
	return url.toString();
}

async function readLimitedStream(
	body: ReadableStream<Uint8Array> | null,
	contentType: string,
	contentLength?: string | null
) {
	const length = Number(contentLength ?? 0);
	if (length > maxUploadBytes) return { error: 'File must be 8 MB or smaller.', status: 413 };
	if (!body) return { error: 'Missing file body.', status: 400 };

	const reader = body.getReader();
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	let received = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > maxUploadBytes) {
			await reader.cancel();
			return { error: 'File must be 8 MB or smaller.', status: 413 };
		}
		const copy = new Uint8Array(value.byteLength);
		copy.set(value);
		chunks.push(copy);
	}

	return { bytes: new Blob(chunks, { type: contentType }), received };
}

async function uploadToMiku(bytes: Blob, filename: string) {
	const uploadForm = new FormData();
	uploadForm.append('file', bytes, filename);

	const uploadUrl = new URL('upload', appEnv.MIKU_BASE_URL);
	uploadUrl.searchParams.set('key', appEnv.MIKU_TOKEN);

	const response = await fetch(uploadUrl, {
		method: 'POST',
		body: uploadForm
	});

	if (!response.ok) return { error: 'CDN upload failed.', status: 502 };

	const result = (await response.json()) as { filename?: string };
	if (!result.filename) return { error: 'CDN response was missing a filename.', status: 502 };

	return { cdnFilename: result.filename };
}

async function convertImageToWebp(bytes: Blob, detectedType: string) {
	const source = Buffer.from(await bytes.arrayBuffer());

	try {
		const result = await sharp(source, {
			animated: detectedType === 'image/gif',
			limitInputPixels: 40_000_000
		})
			.rotate()
			.webp({ quality: 82, effort: 4 })
			.toBuffer({ resolveWithObject: true });

		if (result.data.byteLength > maxUploadBytes) {
			return { error: 'Converted file must be 8 MB or smaller.', status: 413 };
		}

		const webpBytes = new Uint8Array(result.data.byteLength);
		webpBytes.set(result.data);

		return {
			bytes: new Blob([webpBytes], { type: 'image/webp' }),
			filename: randomFilename('image/webp'),
			dimensions: `${result.info.width}x${result.info.height}`,
			sizeBytes: result.data.byteLength
		};
	} catch {
		return {
			error: 'Server could not convert this image to WebP.',
			status: 415
		};
	}
}

async function finishUpload(bytes: Blob, detectedType: string) {
	if (!passthroughTypes.has(detectedType) && !imageTypes.has(detectedType)) {
		return { error: 'Server only accepts still images or WebM uploads.', status: 415 };
	}

	const prepared = imageTypes.has(detectedType)
		? await convertImageToWebp(bytes, detectedType)
		: {
				bytes: bytes.type === detectedType ? bytes : bytes.slice(0, bytes.size, detectedType),
				filename: randomFilename(detectedType),
				dimensions: '',
				sizeBytes: bytes.size
			};
	if ('error' in prepared) return prepared;

	const upload = await uploadToMiku(prepared.bytes, prepared.filename);
	if ('error' in upload) return upload;

	return {
		filename: upload.cdnFilename,
		cdnFilename: upload.cdnFilename,
		url: cdnUrl(upload.cdnFilename, prepared.filename),
		dimensions: prepared.dimensions,
		sizeBytes: prepared.sizeBytes
	};
}

async function uploadRequestBody(request: Request, contentType: string) {
	const body = await readLimitedStream(
		request.body,
		contentType,
		request.headers.get('content-length')
	);
	if ('error' in body) return body;
	if (!body.received) return { error: 'Empty file.', status: 400 };

	const head = new Uint8Array(await body.bytes.slice(0, 32).arrayBuffer());
	const detectedType = sniffAllowedType(head);
	if (!detectedType) {
		return { error: 'File contents do not match an accepted image type.', status: 415 };
	}

	return finishUpload(body.bytes, detectedType);
}

export async function POST({ getClientAddress, request }) {
	const contentType = request.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? '';
	const debug = getRequestDebugContext(request.headers, getClientAddress());
	console.info('[upload-image] request', {
		...debug,
		contentType,
		contentLength: request.headers.get('content-length') ?? '',
		hasTurnstileHeader: Boolean(request.headers.get('x-turnstile-token')?.trim())
	});
	if (!uploadableRequestTypes.has(contentType) && !contentType.startsWith('image/')) {
		return json(
			{ message: 'Only uploaded still images and WebM files are accepted.' },
			{ status: 415 }
		);
	}

	const turnstileSettings = await getTurnstileSettings();
	if (turnstileSettings.uploads) {
		const turnstile = await consumeTurnstilePass(
			request.headers.get('x-turnstile-token')?.trim() ?? '',
			getClientAddress()
		);
		if (!turnstile.ok) {
			console.warn('[upload-image] rejected', {
				...debug,
				reason: turnstile.message,
				turnstileSettings
			});
			return json({ message: turnstile.message }, { status: 403 });
		}
	}

	const result = await uploadRequestBody(request, contentType);
	if ('error' in result) {
		console.warn('[upload-image] failed', {
			...debug,
			reason: result.error,
			status: result.status
		});
		return json({ message: result.error }, { status: result.status });
	}
	if ('filename' in result) {
		console.info('[upload-image] success', {
			...debug,
			filename: result.filename,
			sizeBytes: result.sizeBytes,
			dimensions: result.dimensions
		});
	}
	return json(result);
}
