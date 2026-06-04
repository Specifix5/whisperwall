<script lang="ts">
	import FileShelf from './FileShelf.svelte';
	import Turnstile from './Turnstile.svelte';

	let {
		boardCode,
		open = false,
		onClose = () => {},
		turnstile = { posts: true, uploads: true }
	}: {
		boardCode: string;
		open?: boolean;
		onClose?: () => void;
		turnstile?: { posts: boolean; uploads: boolean };
	} = $props();
</script>

{#if open}
	<div class="modal-backdrop" role="presentation">
		<form
			class="modal"
			method="POST"
			action="?/createThread"
		>
			<div class="panel-title">
				<h2>New Thread on /{boardCode}/</h2>
				<button type="button" aria-label="Close" onclick={onClose}>x</button>
			</div>
			<div class="field-grid">
				<input name="name" placeholder="Name" />
				<input name="options" placeholder="Options (#trip, noko, password##Mod)" />
			</div>
			<input name="subject" placeholder="Subject" required />
			<textarea name="body" rows="6" placeholder="Comment" required></textarea>
			<label class="form-check">
				<input name="spoiler" type="checkbox" />
				Spoiler
			</label>
			<FileShelf turnstileEnabled={turnstile.uploads} />
			{#if turnstile.posts || turnstile.uploads}
				<Turnstile />
			{/if}
			<div class="modal-actions">
				<button type="button" onclick={onClose}>Cancel</button>
				<button class="primary-button" type="submit">Create Thread</button>
			</div>
		</form>
	</div>
{/if}
