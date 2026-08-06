import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importRecipe, importRecipeFromUrl } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export default function ImportPage() {
  const [jsonLd, setJsonLd] = useState('');
  const [url, setUrl] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: importRecipe,
    onSuccess: (recipe) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      navigate(`/recipes/${recipe.id}`);
    },
  });

  // Returns draft for review (vs importRecipe which persists immediately)
  const urlMutation = useMutation({
    mutationFn: importRecipeFromUrl,
    onSuccess: (draft) => {
      navigate('/recipes/new', { state: { aiDraft: draft, draftSource: 'url' } });
    },
  });

  function handlePaste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate({ jsonLd });
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) mutation.mutate({ file });
  }

  function handleUrlSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    urlMutation.mutate(url);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl text-stone-900">Import a recipe</h1>
      <p className="text-sm text-stone-500">
        Paste the JSON-LD from a recipe site's <code>application/ld+json</code> script tag, upload a{' '}
        <code>.json</code> file, or paste the page's URL and we'll fetch it for you.
      </p>

      <form onSubmit={handlePaste} className="space-y-3">
        <textarea
          value={jsonLd}
          onChange={(e) => setJsonLd(e.target.value)}
          rows={12}
          placeholder='{ "@context": "https://schema.org", "@type": "Recipe", ... }'
          className="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-clay focus:outline-none"
        />
        <button
          type="submit"
          disabled={!jsonLd || mutation.isPending}
          className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Importing...' : 'Import from text'}
        </button>
      </form>

      <div className="flex items-center gap-3 text-sm text-stone-400">
        <div className="h-px flex-1 bg-stone-200" />
        or
        <div className="h-px flex-1 bg-stone-200" />
      </div>

      <label className="block rounded-md border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500 hover:border-clay hover:text-clay">
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFile}
        />
        Click to upload a .json file
      </label>

      {mutation.isError && <p className="text-red-600">{mutation.error?.message}</p>}

      <div className="flex items-center gap-3 text-sm text-stone-400">
        <div className="h-px flex-1 bg-stone-200" />
        or
        <div className="h-px flex-1 bg-stone-200" />
      </div>

      <form onSubmit={handleUrlSubmit} className="space-y-3">
        <label className="block text-sm text-stone-500" htmlFor="import-url">
          Paste a recipe page URL — we'll fetch it and pull out the recipe.
        </label>
        <input
          id="import-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/some-recipe"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
        />
        <button
          type="submit"
          disabled={!url || urlMutation.isPending}
          className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {urlMutation.isPending ? 'Fetching...' : 'Import from URL'}
        </button>
        {urlMutation.isError && <p className="text-red-600">{urlMutation.error?.message}</p>}
      </form>
    </div>
  );
}
