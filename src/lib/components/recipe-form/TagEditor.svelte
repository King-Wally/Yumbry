<script lang="ts">
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { addTag, suggestTags } from '#lib/shared/recipe/form.ts';

	interface Props {
		tags: string[];
		existing: { id: number; name: string }[];
	}

	let { tags = $bindable(), existing }: Props = $props();

	let input = $state('');
	let focused = $state(false);

	const suggestions = $derived(focused ? suggestTags(existing, input, tags) : []);

	function add(name = input) {
		tags = addTag(tags, name);
		input = '';
	}

	function remove(name: string) {
		tags = tags.filter((tag) => tag !== name);
	}
</script>

<div>
	{#if tags.length > 0}
		<div class="mb-2 flex flex-wrap gap-1.5">
			{#each tags as tag (tag)}
				<span
					class="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600 capitalize"
				>
					{tag}
					<button
						type="button"
						onclick={() => remove(tag)}
						disabled={!hydrated.current}
						aria-label={m.recipe_form_remove_tag()}
						class="text-stone-400 hover:text-red-600"
					>
						✕
					</button>
					<input type="hidden" name="tag" value={tag} />
				</span>
			{/each}
		</div>
	{/if}
	<div class="relative flex gap-2">
		<input
			type="text"
			bind:value={input}
			defaultValue=""
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					add();
				}
			}}
			aria-label={m.recipe_form_add_tag_placeholder()}
			placeholder={m.recipe_form_add_tag_placeholder()}
			class="flex-1 rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
		/>
		<button
			type="button"
			onclick={() => add()}
			disabled={!hydrated.current}
			class="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
		>
			{m.common_add()}
		</button>
		{#if suggestions.length > 0}
			<ul
				class="absolute top-full left-0 z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-stone-200 bg-white shadow-md"
			>
				{#each suggestions as suggestion (suggestion.id)}
					<li>
						<!-- mousedown, not click: the input keeps focus, so the list doesn't close first. -->
						<button
							type="button"
							onmousedown={(event) => {
								event.preventDefault();
								add(suggestion.name);
							}}
							class="w-full px-3 py-2 text-left text-sm text-stone-700 capitalize hover:bg-stone-100"
						>
							{suggestion.name}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
