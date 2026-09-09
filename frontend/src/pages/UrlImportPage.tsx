import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Search } from 'lucide-react';
import { importRecipeFromUrl } from '../api/client';
import Card from '../components/Card';
import AiErrorBanner from '../components/AiErrorBanner';

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
    <div className="mx-auto max-w-2xl pb-4">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="font-serif text-2xl font-bold text-stone-900">{t('importUrl.title')}</h1>
      </div>

      <Card>
        <Card.Header
          icon={<Search size={20} strokeWidth={2} />}
          title={t('importUrl.cardTitle')}
          description={t('importUrl.cardDescription')}
        />
        <form onSubmit={handleUrlSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="import-url">
              {t('importUrl.urlLabel')}
            </label>
            <input
              id="import-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/some-recipe"
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!url.trim() || urlMutation.isPending}
            className="rounded-md bg-clay px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {urlMutation.isPending ? t('importUrl.fetching') : t('importUrl.importFromUrl')}
          </button>
          {urlMutation.isError && <AiErrorBanner error={urlMutation.error} />}
        </form>
      </Card>
    </div>
  );
}
