import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  isSupportedLocale,
  SMALL_VOLUME_STYLES,
  UNIT_SYSTEMS,
  type SmallVolumeStyle,
  type UnitSystem,
} from 'yumbry-shared';
import { chatAboutRecipe, getRecipe, updateProfile } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import AiErrorBanner from '../components/AiErrorBanner';
import RecipePreview from '../components/RecipePreview';
import { useAuth } from '../hooks/useAuth';
import { renderDraftForReader } from '../utils/render-draft';
import { toRecipeInput } from '../utils/recipe-mapping';
import type { AiChatMessage, AiRecipeDraft } from '../types';

export default function AiChatPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id?: string }>();
  const isImproving = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: recipe } = useQuery({
    queryKey: queryKeys.recipe(id!),
    queryFn: () => getRecipe(id!),
    enabled: isImproving,
  });

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<AiRecipeDraft | null>(null);
  const [seededForId, setSeededForId] = useState<number | null>(null);

  // Seed preview from recipe once, in improve mode only
  if (isImproving && recipe && seededForId !== recipe.id) {
    setSeededForId(recipe.id);
    setDraft(toRecipeInput(recipe));
  }

  const chatMutation = useMutation({
    mutationFn: (nextMessages: AiChatMessage[]) =>
      chatAboutRecipe({ messages: nextMessages, current_draft: draft }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
      setDraft(res.recipe);
    },
  });

  // These are stored preferences like any other, but they live here rather than in Settings
  // because the preview beside them is the only place their effect is visible.
  //
  // Invalidate rather than write the response straight into the cache: AuthProvider mirrors the
  // current user into its own state from inside the query function, so seeding the cache would
  // update no one. Invalidating re-runs that function, which is what actually refreshes context.
  const preferenceMutation = useMutation({
    mutationFn: (data: { unitSystem?: UnitSystem; smallVolumes?: SmallVolumeStyle }) =>
      updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });

  const unitSystem = user?.unitSystem ?? 'metric';
  const smallVolumes = user?.smallVolumes ?? 'spoons';
  const locale = isSupportedLocale(i18n.language) ? i18n.language : 'en';

  // The draft the server sent is already rendered, but a preference can change after it arrives —
  // so redraw from the canonical amounts that travel with it.
  const shownDraft = renderDraftForReader(draft, { locale, unitSystem, smallVolumes });

  function handleSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const next: AiChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    chatMutation.mutate(next);
  }

  function handleSave() {
    if (!shownDraft) return;
    // Save exactly what is on screen, not the server's last rendering of it.
    if (isImproving) {
      navigate(`/recipes/${id}/edit`, { state: { aiDraft: shownDraft } });
    } else {
      navigate('/recipes/new', { state: { aiDraft: shownDraft } });
    }
  }

  if (isImproving && !recipe) return <p className="text-stone-500">{t('aiChat.loadingRecipe')}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl text-stone-900">
          {isImproving
            ? t('aiChat.improveTitle', { title: recipe!.title })
            : t('aiChat.createTitle')}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {isImproving ? t('aiChat.improveDescription') : t('aiChat.createDescription')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {/* Chat column */}
        <div className="flex h-[60vh] flex-col rounded-xl border border-stone-200 bg-white shadow-sm md:h-[70vh]">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-stone-400">
                {isImproving ? t('aiChat.improveExample') : t('aiChat.createExample')}
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[80%] rounded-lg bg-clay px-3 py-2 text-sm text-white'
                    : 'mr-auto max-w-[80%] rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700'
                }
              >
                {message.content}
              </div>
            ))}
            {chatMutation.isPending && (
              <p className="text-sm text-stone-400">{t('aiChat.thinking')}</p>
            )}
          </div>

          <div className="border-t border-stone-200 p-3">
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isImproving ? t('aiChat.changePlaceholder') : t('aiChat.cookPlaceholder')
                }
                disabled={chatMutation.isPending}
                className="flex-1 rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || chatMutation.isPending}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                {t('aiChat.send')}
              </button>
            </form>
            {chatMutation.isError && <AiErrorBanner error={chatMutation.error} />}
          </div>
        </div>

        {/* Preview column */}
        <div className="flex h-[60vh] flex-col rounded-xl border border-stone-200 bg-white shadow-sm md:h-[70vh]">
          <div className="flex flex-wrap gap-3 border-b border-stone-200 p-3">
            <label
              className="min-w-[8rem] flex-1 text-xs font-medium text-stone-600"
              title={t('aiChat.units.description')}
            >
              {t('aiChat.units.label')}
              <select
                value={unitSystem}
                onChange={(e) =>
                  preferenceMutation.mutate({ unitSystem: e.target.value as UnitSystem })
                }
                disabled={preferenceMutation.isPending}
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm text-stone-700 focus:border-clay focus:outline-none disabled:opacity-50"
              >
                {UNIT_SYSTEMS.map((key) => (
                  <option key={key} value={key}>
                    {t(`aiChat.units.options.${key}`)}
                  </option>
                ))}
              </select>
            </label>

            <label
              className="min-w-[8rem] flex-1 text-xs font-medium text-stone-600"
              title={t('aiChat.smallVolumes.description')}
            >
              {t('aiChat.smallVolumes.label')}
              <select
                value={smallVolumes}
                onChange={(e) =>
                  preferenceMutation.mutate({ smallVolumes: e.target.value as SmallVolumeStyle })
                }
                // Imperial has no alternative to spoons at these sizes, so the control would have
                // nothing to do.
                disabled={preferenceMutation.isPending || unitSystem === 'imperial'}
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm text-stone-700 focus:border-clay focus:outline-none disabled:opacity-50"
              >
                {SMALL_VOLUME_STYLES.map((key) => (
                  <option key={key} value={key}>
                    {t(`aiChat.smallVolumes.options.${key}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <RecipePreview draft={shownDraft} />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!shownDraft}
          className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {t('aiChat.saveAndReview')}
        </button>
      </div>
    </div>
  );
}
