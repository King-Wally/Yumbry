import { useEffect, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Camera, X } from 'lucide-react';
import { importRecipeFromPhoto } from '../api/client';
import Card from '../components/Card';
import AiErrorBanner from '../components/AiErrorBanner';

export default function PhotoImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // An object URL beats reading the file into a base64 data URL: the file goes up as multipart, so
  // nothing else needs it in memory. Created with the file rather than in an effect so the preview
  // never renders a frame behind the selection.
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);

  // Revokes the previous URL whenever the photo changes, and the last one on unmount.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  // Returns a draft for review, exactly like the URL import — nothing is saved until the form is.
  const importMutation = useMutation({
    mutationFn: importRecipeFromPhoto,
    onSuccess: (res) => {
      navigate('/recipes/new', { state: { aiDraft: res.recipe, draftSource: 'photo' } });
    },
  });

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto({ file, url: URL.createObjectURL(file) });
      importMutation.reset();
    }
    // Cleared so picking the same file again still fires onChange.
    e.target.value = '';
  }

  function removePhoto() {
    setPhoto(null);
    importMutation.reset();
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
        <h1 className="font-serif text-2xl font-bold text-stone-900">{t('importPhoto.title')}</h1>
      </div>

      <Card>
        <Card.Header
          icon={<Camera size={20} strokeWidth={2} />}
          title={t('importPhoto.cardTitle')}
          description={t('importPhoto.cardDescription')}
        />

        {!photo && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-stone-300 px-4 py-10 text-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {/* `capture` asks a phone for the camera directly; desktop browsers ignore it and
                  fall back to the file picker, which is why the second button exists. */}
              <label className="bg-clay cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-white">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {t('importPhoto.takePhoto')}
              </label>
              <label className="cursor-pointer rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {t('importPhoto.uploadPhoto')}
              </label>
            </div>
            <p className="text-sm text-stone-400">{t('importPhoto.hint')}</p>
          </div>
        )}

        {photo && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border border-stone-200">
              <img
                src={photo.url}
                alt={t('importPhoto.previewAlt')}
                className="max-h-80 w-full bg-stone-100 object-contain"
              />
              {!importMutation.isPending && (
                <button
                  type="button"
                  onClick={removePhoto}
                  aria-label={t('importPhoto.removePhoto')}
                  className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm hover:bg-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => importMutation.mutate(photo.file)}
              disabled={importMutation.isPending}
              className="bg-clay rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {importMutation.isPending ? t('importPhoto.reading') : t('importPhoto.submit')}
            </button>
          </div>
        )}

        {importMutation.isError && (
          <div className="mt-3">
            <AiErrorBanner error={importMutation.error} />
          </div>
        )}
      </Card>
    </div>
  );
}
