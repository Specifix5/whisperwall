<script lang="ts">
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import { onDestroy, onMount, tick } from 'svelte';

	type TurnstileApi = {
		render: (
			container: HTMLElement,
			options: {
				sitekey: string;
				theme: 'dark' | 'light' | 'auto';
				size: 'normal' | 'compact' | 'flexible';
				'response-field-name': string;
				callback: (token: string) => void;
				'expired-callback': () => void;
				'error-callback': () => void;
			}
		) => string;
		reset: (widgetId?: string) => void;
		remove: (widgetId: string) => void;
	};

	let {
		name = 'turnstilePass',
		size = 'normal'
	}: {
		name?: string;
		size?: 'normal' | 'compact' | 'flexible';
	} = $props();

	let host = $state<HTMLDivElement>();
	let widgetHost = $state<HTMLDivElement>();
	let formElement = $state<HTMLFormElement>();
	let widgetId: string | null = null;
	let removeResetListener = () => {};
	let pass = $state('');
	let status = $state('');
	let visible = $state(false);
	let pendingReady: ((pass: string) => void) | null = null;
	const siteKey = $derived(env.PUBLIC_TURNSTILE_SITE_KEY ?? '');

	function getTurnstile() {
		return (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
	}

	function loadTurnstileScript() {
		const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script]');
		if (existing) {
			return new Promise<void>((resolve, reject) => {
				if (getTurnstile()) {
					resolve();
					return;
				}
				existing.addEventListener('load', () => resolve(), { once: true });
				existing.addEventListener('error', () => reject(new Error('Could not load Turnstile.')), {
					once: true
				});
			});
		}

		return new Promise<void>((resolve, reject) => {
			const script = document.createElement('script');
			script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
			script.async = true;
			script.defer = true;
			script.dataset.turnstileScript = 'true';
			script.addEventListener('load', () => resolve(), { once: true });
			script.addEventListener('error', () => reject(new Error('Could not load Turnstile.')), {
				once: true
			});
			document.head.append(script);
		});
	}

	async function mintPass(token: string) {
		status = 'Checking captcha...';
		const form = new FormData();
		form.set('cf-turnstile-response', token);

		const response = await fetch('/api/turnstile-pass', {
			method: 'POST',
			body: form
		});
		const result = (await response.json()) as { pass?: string; message?: string };
		if (!response.ok || !result.pass) {
			pass = '';
			status = result.message ?? 'Captcha failed.';
			pendingReady = null;
			return;
		}

		pass = result.pass;
		status = 'Captcha ready.';
		pendingReady?.(pass);
		pendingReady = null;
	}

	async function renderTurnstile() {
		await tick();
		if (!browser || !siteKey || widgetId || !widgetHost || !visible) return;
		await loadTurnstileScript();
		const turnstile = getTurnstile();
		if (!turnstile) return;

		widgetId = turnstile.render(widgetHost, {
			sitekey: siteKey,
			theme: 'dark',
			size,
			'response-field-name': 'cf-turnstile-response',
			callback: (token) => void mintPass(token),
			'expired-callback': () => {
				pass = '';
				status = 'Captcha expired.';
			},
			'error-callback': () => {
				pass = '';
				status = 'Captcha failed.';
				pendingReady = null;
			}
		});
	}

	function showCaptcha() {
		visible = true;
		status = pass ? 'Captcha ready.' : 'Complete the captcha.';
		void renderTurnstile();
	}

	onMount(() => {
		formElement = host?.closest('form') ?? undefined;

		const reset = () => {
			const turnstile = getTurnstile();
			pass = '';
			if (turnstile && widgetId) turnstile.reset(widgetId);
		};
		const requestPass = (event: Event) => {
			const customEvent = event as CustomEvent<{ onReady?: (pass: string) => void }>;
			if (pass) {
				customEvent.detail?.onReady?.(pass);
				return;
			}
			pendingReady = customEvent.detail?.onReady ?? null;
			showCaptcha();
		};

		window.addEventListener(`turnstile-reset:${name}`, reset);
		formElement?.addEventListener('request-turnstile-pass', requestPass);
		removeResetListener = () => window.removeEventListener(`turnstile-reset:${name}`, reset);
		removeResetListener = () => {
			window.removeEventListener(`turnstile-reset:${name}`, reset);
			formElement?.removeEventListener('request-turnstile-pass', requestPass);
		};
	});

	onDestroy(() => {
		removeResetListener();
		const turnstile = browser ? getTurnstile() : null;
		if (turnstile && widgetId) turnstile.remove(widgetId);
	});
</script>

{#if siteKey}
	<input type="hidden" {name} value={pass} />
	<div class="turnstile-shell" bind:this={host}>
		{#if !visible && !pass}
			<button class="turnstile-button" type="button" onclick={showCaptcha}>Get Captcha</button>
		{/if}
		{#if visible}
			<div class="turnstile-widget" bind:this={widgetHost}></div>
		{/if}
		{#if status}<small>{status}</small>{/if}
	</div>
{/if}
