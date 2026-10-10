<script lang="ts">
	import RecipeForm from '#lib/components/recipe-form/RecipeForm.svelte';
	import { draftNotice } from '#lib/client/draft-notice.ts';
	import { EMPTY_RECIPE_FORM } from '#lib/shared/recipe/form.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const notice = $derived(draftNotice(data.draftSource));
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
