<script lang="ts">
	import RecipeForm from '#lib/components/RecipeForm.svelte';
	import { EMPTY_RECIPE_FORM } from '#lib/shared/recipe-form.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<RecipeForm
	mode="new"
	initial={form?.values ?? EMPTY_RECIPE_FORM}
	errors={form?.errors}
	tags={data.tags}
	categories={data.categories}
	backHref="/"
/>
