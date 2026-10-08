<script lang="ts">
	import RecipeForm from '#lib/components/RecipeForm.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { EMPTY_RECIPE_FORM } from '#lib/shared/recipe-form.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Says where a handed-off draft came from, so the cook knows nothing is saved yet.
	const notice = $derived(
		data.draftSource === 'url'
			? m.recipe_form_reviewing_url_draft()
			: data.draftSource === 'photo'
				? m.recipe_form_reviewing_photo_draft()
				: data.draftSource === 'ai'
					? m.recipe_form_reviewing_ai_draft()
					: undefined
	);
</script>

<RecipeForm
	mode="new"
	initial={form?.values ?? data.draft ?? EMPTY_RECIPE_FORM}
	errors={form?.errors}
	tags={data.tags}
	categories={data.categories}
	backHref="/"
	{notice}
/>
