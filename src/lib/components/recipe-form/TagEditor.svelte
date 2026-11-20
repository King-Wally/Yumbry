<script lang="ts">
	import { Check } from '@lucide/svelte';
	import PillAdder from '#lib/components/recipe-form/PillAdder.svelte';
	import { pill, pillOff, pillOn } from '#lib/components/recipe-form/pill.ts';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { addTag } from '#lib/shared/recipe/form.ts';

	interface Props {
		tags: string[];
		existing: { id: number; name: string }[];
	}

	let { tags = $bindable(), existing }: Props = $props();

	const lower = (name: string) => name.toLowerCase();
	const isOn = (name: string) => tags.some((tag) => lower(tag) === lower(name));
	// Every tag the family has, then the ones added in this form that it doesn't.
	const options = $derived([
		...existing.map((tag) => tag.name),
		...tags.filter((tag) => !existing.some((e) => lower(e.name) === lower(tag)))
	]);

	function toggle(name: string) {
		tags = isOn(name) ? tags.filter((tag) => lower(tag) !== lower(name)) : addTag(tags, name);
	}
</script>

<div class="flex flex-col gap-2">
	<div role="group" aria-label={m.recipe_form_tags()} class="flex flex-wrap items-center gap-2">
		{#each options as name (lower(name))}
			{@const on = isOn(name)}
			<button
				type="button"
				role="checkbox"
				aria-checked={on}
				onclick={() => toggle(name)}
				disabled={!hydrated.current}
				class={[pill, on ? pillOn : pillOff]}
			>
				<span
					aria-hidden="true"
					class={[
						'inline-flex overflow-hidden transition-all duration-200 ease-out',
						on ? 'mr-1 max-w-3.5 opacity-100' : 'mr-0 max-w-0 opacity-0'
					]}
				>
					<Check size={14} strokeWidth={2.25} />
				</span>
				{name}
			</button>
		{/each}
	</div>
	<PillAdder
		label={m.tag_editor_new()}
		inputLabel={m.tag_editor_name_label()}
		confirmLabel={m.tag_editor_confirm()}
		existing={options}
		onadd={(name) => (tags = addTag(tags, name))}
	/>
	{#each tags as tag (tag)}
		<input type="hidden" name="tag" value={tag} />
	{/each}
</div>
