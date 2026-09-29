import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { disableRecipeShare, enableRecipeShare, getRecipeShareUrl } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import type { Recipe } from '../types';
import ConfirmDialog from './ConfirmDialog';
import Dialog from './Dialog';

interface ShareRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: number;
  shareToken: string | null;
}

export default function ShareRecipeDialog({
  open,
  onOpenChange,
  recipeId,
  shareToken,
}: ShareRecipeDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);

  // Written straight into the cached recipe so the dialog flips state without
  // waiting on a refetch; the invalidation then confirms it against the server.
  function setCachedToken(token: string | null) {
    queryClient.setQueryData<Recipe>(queryKeys.recipe(recipeId), (recipe) =>
      recipe ? { ...recipe, share_token: token } : recipe
    );
    queryClient.invalidateQueries({ queryKey: queryKeys.recipe(recipeId) });
  }

  const enableMutation = useMutation({
    mutationFn: () => enableRecipeShare(recipeId),
    onSuccess: ({ share_token }) => setCachedToken(share_token),
  });

  const disableMutation = useMutation({
    mutationFn: () => disableRecipeShare(recipeId),
    onSuccess: () => {
      setCachedToken(null);
      setConfirmStopOpen(false);
    },
    // ConfirmDialog has nowhere to show an error, so hand back to the share
    // dialog, which renders it above the still-active link.
    onError: () => {
      setConfirmStopOpen(false);
      onOpenChange(true);
    },
  });

  const shareUrl = shareToken ? getRecipeShareUrl(shareToken) : '';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The Clipboard API only exists in secure contexts, and a self-hosted
      // instance may well be served over plain http — leave the link selected
      // so it can be copied by hand.
      inputRef.current?.select();
    }
  }

  function handleStopClick() {
    // One dialog at a time: the confirmation replaces this one rather than
    // stacking on top of it.
    onOpenChange(false);
    setConfirmStopOpen(true);
  }

  const error = enableMutation.error ?? disableMutation.error;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('recipes.share.title')}
        description={t('recipes.share.description')}
      >
        {error && <p className="mb-3 text-sm text-red-600">{error.message}</p>}

        {shareToken ? (
          <>
            <label className="mb-1.5 block text-sm font-medium text-stone-700" htmlFor="share-link">
              {t('recipes.share.linkLabel')}
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id="share-link"
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="focus:border-clay w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-[13px] text-stone-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="bg-clay shrink-0 rounded-md px-4 py-2 text-[13px] text-white"
              >
                {copied ? t('recipes.share.copied') : t('recipes.share.copyLink')}
              </button>
            </div>
            <p className="mt-2 text-xs text-stone-500">{t('recipes.share.hint')}</p>

            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleStopClick}
                className="text-sm text-red-600 hover:underline"
              >
                {t('recipes.share.stop')}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
              >
                {t('recipes.share.done')}
              </button>
            </div>
          </>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => enableMutation.mutate()}
              disabled={enableMutation.isPending}
              className="bg-clay hover:bg-clay/90 rounded-md px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {enableMutation.isPending ? t('common.working') : t('recipes.share.createLink')}
            </button>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmStopOpen}
        onOpenChange={setConfirmStopOpen}
        title={t('recipes.share.stopDialogTitle')}
        description={t('recipes.share.stopDialogDescription')}
        confirmLabel={t('recipes.share.stop')}
        isDanger
        isPending={disableMutation.isPending}
        onConfirm={() => disableMutation.mutate()}
      />
    </>
  );
}
