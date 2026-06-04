<script lang="ts">
	import { env } from '$env/dynamic/public';

	let { turnstileEnabled = true }: { turnstileEnabled?: boolean } = $props();

	const maxUploadBytes = 8 * 1024 * 1024;

	let imageUrl = $state('');
	let imageName = $state('');
	let imageSize = $state('');
	let imageDimensions = $state('');
	let imageOriginalName = $state('');
	let status = $state('No file selected.');
	let uploading = $state(false);
	let shelfElement: HTMLDivElement;
	const shouldVerifyUpload = $derived(Boolean(env.PUBLIC_TURNSTILE_SITE_KEY) && turnstileEnabled);

	function assertSize(file: Blob) {
		if (file.size > maxUploadBytes) throw new Error('File must be 8 MB or smaller.');
	}

	function formatBytes(bytes: number) {
		const unit = bytes >= 1024 * 1024 ? 'MB' : 'KB';
		const value = unit === 'MB' ? bytes / (1024 * 1024) : bytes / 1024;
		return `${value.toFixed(1)}${unit}`;
	}

	async function getImageDimensions(blob: Blob) {
		const url = URL.createObjectURL(blob);
		try {
			const image = new Image();
			const loaded = new Promise<{ width: number; height: number }>((resolve, reject) => {
				image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
				image.onerror = () => reject(new Error('Could not read image dimensions.'));
			});
			image.src = url;
			return await loaded;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	async function getVideoDimensions(blob: Blob) {
		const url = URL.createObjectURL(blob);
		try {
			const video = document.createElement('video');
			const loaded = new Promise<{ width: number; height: number }>((resolve, reject) => {
				video.onloadedmetadata = () =>
					resolve({ width: video.videoWidth, height: video.videoHeight });
				video.onerror = () => reject(new Error('Could not read video dimensions.'));
			});
			video.preload = 'metadata';
			video.src = url;
			return await loaded;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	async function getDimensions(blob: Blob, type: string) {
		const dimensions =
			type === 'video/webm' ? await getVideoDimensions(blob) : await getImageDimensions(blob);
		return `${dimensions.width}x${dimensions.height}`;
	}

	async function prepareFile(file: File) {
		assertSize(file);
		if (file.type === 'video/webm') {
			return {
				blob: file,
				dimensions: await getDimensions(file, file.type),
				type: file.type,
				originalName: file.name
			};
		}
		if (file.type.startsWith('video/')) {
			throw new Error('Only WebM video files are accepted.');
		}
		if (file.type.startsWith('image/') || file.type === '') {
			return {
				blob: file,
				dimensions: await getDimensions(file, file.type || 'image/*'),
				type: file.type || 'application/octet-stream',
				originalName: file.name
			};
		}
		throw new Error('Only still images and WebM files are accepted.');
	}

async function readUploadResult(
	response: Response,
	metadata: { dimensions: string; size: string; originalName: string }
) {
		const result = (await response.json()) as {
			url?: string;
			filename?: string;
			dimensions?: string;
			sizeBytes?: number;
			message?: string;
		};
		if (!response.ok || !result.url || !result.filename) {
			throw new Error(result.message ?? 'Upload failed.');
		}

	imageUrl = result.url;
	imageName = result.filename;
	imageOriginalName = metadata.originalName;
	imageSize = result.sizeBytes ? formatBytes(result.sizeBytes) : metadata.size;
	imageDimensions = result.dimensions || metadata.dimensions;
	status = `Attached ${imageName} (${imageDimensions}, ${imageSize})`;
	}

	async function uploadFile(file: File) {
		uploading = true;
		status = 'Preparing file...';
		try {
			const form = shelfElement.closest('form');
			let uploadToken = form
				?.querySelector<HTMLInputElement>('input[name="turnstilePass"]')
				?.value.trim();
			if (shouldVerifyUpload && !uploadToken) {
				status = 'Complete captcha to upload...';
				uploadToken = await new Promise<string>((resolve, reject) => {
					const timeout = window.setTimeout(() => reject(new Error('Captcha timed out.')), 120000);
					form?.dispatchEvent(
						new CustomEvent('request-turnstile-pass', {
							detail: {
								onReady: (pass: string) => {
									window.clearTimeout(timeout);
									resolve(pass);
								}
							}
						})
					);
					if (!form) {
						window.clearTimeout(timeout);
						reject(new Error('Captcha form was not found.'));
					}
				});
			}

			const prepared = await prepareFile(file);
			status = 'Uploading...';
			const metadata = {
				dimensions: prepared.dimensions,
				size: formatBytes(prepared.blob.size),
				originalName: prepared.originalName
			};
			const response = await fetch('/api/upload-image', {
				method: 'POST',
				headers: {
					'content-type': prepared.type,
					'x-file-name': encodeURIComponent(prepared.originalName),
					...(uploadToken ? { 'x-turnstile-token': uploadToken } : {})
				},
				body: prepared.blob
			});
			await readUploadResult(response, metadata);
		} catch (error) {
			status = error instanceof Error ? error.message : 'Upload failed.';
		} finally {
			uploading = false;
		}
	}

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		void uploadFile(file);
	}
</script>

<div class="file-shelf" bind:this={shelfElement}>
	<input type="hidden" name="imageUrl" value={imageUrl} />
	<input type="hidden" name="imageName" value={imageName} />
	<input type="hidden" name="imageSize" value={imageSize} />
	<input type="hidden" name="imageDimensions" value={imageDimensions} />
	<input type="hidden" name="imageOriginalName" value={imageOriginalName} />
	<label class="file-drop" aria-busy={uploading}>
		<input
			type="file"
			accept="image/*,.webm,video/webm"
			disabled={uploading}
			onchange={handleFileChange}
		/>
		<span>{uploading ? 'Uploading...' : 'Upload image / WebM'}</span>
		<small>{status}</small>
	</label>
</div>
