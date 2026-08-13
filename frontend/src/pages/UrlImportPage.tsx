import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { importRecipeFromUrl } from '../api/client';

export default function UrlImportPage() {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const navigate = useNavigate();

  // Returns draft for review (vs importRecipe which persists immediately)
  const urlMutation = useMutation({
    mutationFn: importRecipeFromUrl,
    onSuccess: (draft) => {
      navigate('/recipes/new', { state: { aiDraft: draft, draftSource: 'url' } });
    },
  });

  function handleUrlSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    urlMutation.mutate(url);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl text-stone-900">{t('importUrl.title')}</h1>

      <form onSubmit={handleUrlSubmit} className="space-y-3">
        <label className="block text-sm text-stone-500" htmlFor="import-url">
          {t('importUrl.description')}
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
          {urlMutation.isPending ? t('importUrl.fetching') : t('importUrl.importFromUrl')}
        </button>
        {urlMutation.isError && <p className="text-red-600">{urlMutation.error?.message}</p>}
      </form>
    </div>
  );
}
