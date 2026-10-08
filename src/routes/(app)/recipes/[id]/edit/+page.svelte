<script lang="ts">
	import PhotoUpload from '#lib/components/PhotoUpload.svelte';
	import RecipeForm from '#lib/components/RecipeForm.svelte';
	import { draftNotice } from '#lib/draft-notice.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { formStateFromRecipe } from '#lib/shared/recipe-form.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// `form` holds a refused save, or the result of a photo upload, which PhotoUpload handles.
	const failedSave = $derived(form && 'values' in form ? form : null);
	// "Improve with AI" lands its draft here for review.
	const notice = $derived(draftNotice(data.draftSource));
</script>

<!-- Keyed, so moving to another recipe's edit page starts a fresh form. -->
{#key data.recipe.id}
	<RecipeForm
		mode="edit"
		initial={failedSave?.values ?? data.draft ?? formStateFromRecipe(data.recipe)}
		errors={failedSave?.errors}
		tags={data.tags}
		categories={data.categories}
		backHref="/recipes/{data.recipe.id}"
		{notice}
	>
		{#snippet photo()}
			<PhotoUpload imagePath={data.recipe.image_path} label={m.recipe_form_photo_label()} />
		{/snippet}
	</RecipeForm>
{/key}
