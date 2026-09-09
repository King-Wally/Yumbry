import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ClipboardPaste, Upload } from 'lucide-react';
import { importRecipe } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import Card from '../components/Card';
import AiErrorBanner from '../components/AiErrorBanner';

export default function ImportPage() {
  const { t } = useTranslation();
  const [jsonLd, setJsonLd] = useState('');
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

  function handlePaste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate({ jsonLd });
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) mutation.mutate({ file });
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
        <h1 className="font-serif text-2xl font-bold text-stone-900">{t('importJson.title')}</h1>
      </div>

      <div className="space-y-6">
        <Card>
          <Card.Header
            icon={<ClipboardPaste size={20} strokeWidth={2} />}
            title={t('importJson.cardTitle')}
            description={t('importJson.cardDescription')}
          />
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
              disabled={!jsonLd.trim() || mutation.isPending}
              className="rounded-md bg-clay px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {mutation.isPending ? t('importJson.importingText') : t('importJson.importFromText')}
            </button>
          </form>
        </Card>

        <div className="flex items-center gap-3 text-sm text-stone-400">
          <div className="h-px flex-1 bg-stone-200" />
          {t('common.or')}
          <div className="h-px flex-1 bg-stone-200" />
        </div>

        <Card>
          <label className="block cursor-pointer rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500 hover:border-clay hover:text-clay">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFile}
            />
            <Upload size={22} strokeWidth={2} className="mx-auto mb-2 opacity-60" />
            {t('importJson.uploadJsonFile')}
          </label>
        </Card>

        {mutation.isError && <AiErrorBanner error={mutation.error} />}
      </div>
    </div>
  );
}
