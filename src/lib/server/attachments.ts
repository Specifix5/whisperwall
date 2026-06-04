import { appEnv } from '$lib/server/config';

const finalAttachmentPattern = /\.(webp|webm)$/i;
const sizePattern = /^\d+\.\d(KB|MB)$/;
const dimensionsPattern = /^\d+x\d+$/;

function isCdnUrl(value: string) {
	try {
		const url = new URL(value);
		const cdn = new URL(appEnv.CDN_URL);
		return url.origin === cdn.origin && url.pathname.startsWith(cdn.pathname);
	} catch {
		return false;
	}
}

function safeDisplayName(value: string) {
	const basename = value.split(/[\\/]/).pop() ?? '';
	return basename.replaceAll(/[^\w.-]/g, '_').replace(/_+/g, '_');
}

export function readAttachmentForm(form: FormData) {
	const imageUrl = String(form.get('imageUrl') ?? '').trim();
	const imageName = safeDisplayName(String(form.get('imageName') ?? '').trim());
	const imageSize = String(form.get('imageSize') ?? '').trim();
	const imageDimensions = String(form.get('imageDimensions') ?? '').trim();

	if (!imageUrl && !imageName) {
		return { imageUrl: '', imageName: '', imageOriginalName: '', imageSize: '', imageDimensions: '' };
	}

	if (!imageUrl || !imageName || !imageSize || !imageDimensions) {
		return { error: 'Upload the file again before posting.' };
	}

	if (!isCdnUrl(imageUrl)) {
		return { error: 'Attachments must be uploaded through the file uploader.' };
	}

	if (!finalAttachmentPattern.test(imageName)) {
		return { error: 'Attachments must be WebP or WebM.' };
	}

	if (!sizePattern.test(imageSize) || !dimensionsPattern.test(imageDimensions)) {
		return { error: 'Attachment metadata is invalid. Upload the file again.' };
	}

	return { imageUrl, imageName, imageOriginalName: '', imageSize, imageDimensions };
}
