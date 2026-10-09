<script lang="ts">
	import { enhance } from '$app/forms';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';

	// Mirrors PHOTO_LIMIT_MB in #lib/server/uploads/storage.ts (server-only), which has the final say.
	const PHOTO_LIMIT_MB = 25;

	interface Props {
		imagePath: string | null;
		label?: string;
	}

	let { imagePath, label = m.image_upload_photo() }: Props = $props();

	// Follows the prop, and is overwritten locally by a successful upload.
	let path = $derived(imagePath);
	let error = $state<string | null>(null);
	let uploading = $state(false);

	let fileInput: HTMLInputElement;

	function photoErrorMessage(kind: unknown): string {
		switch (kind) {
			case 'unsupported_type':
				return m.photo_error_unsupported_type();
			case 'too_large':
				return m.photo_error_too_large({ limitMb: PHOTO_LIMIT_MB });
			case 'unreadable_image':
				return m.photo_error_unreadable_image();
			default:
				return m.photo_error_missing();
		}
	}

	function onChange() {
		const file = fileInput.files?.[0];
		if (!file) return;
		if (file.size > PHOTO_LIMIT_MB * 1024 * 1024) {
			error = photoErrorMessage('too_large');
			fileInput.value = '';
			return;
		}
		fileInput.form?.requestSubmit();
	}
</script>

<form
	method="POST"
	action="?/photo"
	enctype="multipart/form-data"
	use:enhance={() => {
		uploading = true;
		return async ({ result, update }) => {
			uploading = false;
			fileInput.value = '';
			if (result.type === 'success') {
				path = (result.data?.image_path as string | undefined) ?? path;
				error = null;
			} else if (result.type === 'failure') {
				error = photoErrorMessage(result.data?.photoError);
			} else {
				await update();
			}
		};
	}}
>
	<div class="flex items-center gap-3">
		{#if path}
			<img src={path} alt={label} decoding="async" class="h-16 w-16 rounded object-cover" />
		{/if}
		<button
			type="button"
			disabled={!hydrated.current || uploading}
			onclick={() => fileInput.click()}
			class="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
		>
			{path
				? m.image_upload_replace({ label: label.toLowerCase() })
				: m.image_upload_upload({ label: label.toLowerCase() })}
		</button>
		<input
			bind:this={fileInput}
			type="file"
			name="photo"
			accept="image/*"
			class="hidden"
			onchange={onChange}
		/>
	</div>
	{#if error}
		<p role="alert" class="mt-2 text-sm text-red-600">{error}</p>
	{/if}
</form>
