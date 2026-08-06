import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { chatAboutRecipe, getRecipe } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import AiErrorBanner from '../components/AiErrorBanner';
import RecipePreview from '../components/RecipePreview';
import { toRecipeInput } from '../utils/recipe-mapping';
import { useAiSettings } from '../hooks/useAiSettings';
import { useAuth } from '../hooks/useAuth';
import { chatWithOllamaDirect } from '../services/ollama-direct';
import type { AiChatMessage, RecipeInput } from '../types';

export default function AiChatPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id?: string }>();
  const isImproving = Boolean(id);
  const navigate = useNavigate();

  const { data: recipe } = useQuery({
    queryKey: queryKeys.recipe(id!),
    queryFn: () => getRecipe(id!),
    enabled: isImproving,
  });

  const { data: aiSettings } = useAiSettings();
  const { user } = useAuth();

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<RecipeInput | null>(null);
  const [seededForId, setSeededForId] = useState<number | null>(null);

  // Seed preview from recipe once, in improve mode only
  if (isImproving && recipe && seededForId !== recipe.id) {
    setSeededForId(recipe.id);
    setDraft(toRecipeInput(recipe));
  }

  const chatMutation = useMutation({
    mutationFn: (nextMessages: AiChatMessage[]) => {
      if (!aiSettings?.model || !aiSettings?.provider) {
        return Promise.reject(new Error(t('aiChat.noModelConfigured')));
      }
      if (aiSettings.provider === 'ollama') {
        return chatWithOllamaDirect(nextMessages, draft, {
          baseUrl: aiSettings.base_url,
          model: aiSettings.model,
          locale: user?.locale ?? 'en',
        });
      }
      return chatAboutRecipe({ messages: nextMessages, current_draft: draft });
    },
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
      setDraft(res.recipe);
    },
  });

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
    if (!draft) return;
    if (isImproving) {
      navigate(`/recipes/${id}/edit`, { state: { aiDraft: draft } });
    } else {
      navigate('/recipes/new', { state: { aiDraft: draft } });
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
        <div className="h-[60vh] overflow-y-auto rounded-xl border border-stone-200 bg-white p-5 shadow-sm md:h-[70vh]">
          <RecipePreview draft={draft} />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!draft}
          className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {t('aiChat.saveAndReview')}
        </button>
      </div>
    </div>
  );
}
