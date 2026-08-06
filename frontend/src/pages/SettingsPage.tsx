import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { deleteAccount, listAiModels, updateAiSettings, updateProfile } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useAiSettings } from '../hooks/useAiSettings';
import { useAuth } from '../hooks/useAuth';
import { listOllamaModelsDirect } from '../services/ollama-direct';
import Dialog from '../components/Dialog';
import type { AiProvider } from '../types';
import { SUPPORTED_LOCALES, type SupportedLocale } from 'yumbry-shared';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  ollama: 'Ollama',
  custom: 'Custom (OpenAI-compatible)',
};

const BASE_URL_REQUIRED: Record<AiProvider, boolean> = {
  openai: false,
  anthropic: false,
  gemini: false,
  ollama: true,
  custom: true,
};

// Native-language names — always shown as-is, regardless of the active UI language.
const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  nl: 'Nederlands',
  fr: 'Français',
  es: 'Español',
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { clearSession, user } = useAuth();

  const { data: settings } = useAiSettings();

  const [provider, setProvider] = useState<AiProvider | ''>('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[] | null>(null);

  // Form hydration in render (not useEffect) to avoid stale-value flash
  if (settings && !loaded) {
    setLoaded(true);
    setProvider(settings.provider ?? '');
    setBaseUrl(settings.base_url ?? '');
    setModel(settings.model ?? '');
    setHasApiKey(settings.has_api_key);
  }

  const checkConnectionMutation = useMutation({
    mutationFn: () =>
      provider === 'ollama'
        ? listOllamaModelsDirect(baseUrl || null)
        : listAiModels(baseUrl || undefined, provider || undefined),
    onSuccess: (res) => setAvailableModels(res.models.map((m) => m.name)),
    onError: () => setAvailableModels(null),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAiSettings({
        provider: provider as AiProvider,
        base_url: baseUrl || null,
        model: model || null,
        ...(clearApiKey ? { api_key: null } : apiKey ? { api_key: apiKey } : {}),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiSettings });
      setApiKey('');
      setClearApiKey(false);
      setHasApiKey(updated.has_api_key);
    },
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    saveMutation.mutate();
  }

  const baseUrlRequired = provider ? BASE_URL_REQUIRED[provider] : false;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(deletePassword),
    onSuccess: () => clearSession(),
  });

  function handleDeleteSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    deleteAccountMutation.mutate();
  }

  const localeMutation = useMutation({
    mutationFn: (locale: SupportedLocale) => updateProfile({ locale }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe });
    },
  });

  return (
    <div className="max-w-xl space-y-10">
      <div className="space-y-3">
        <div>
          <h1 className="font-serif text-2xl text-stone-900">{t('settings.language.title')}</h1>
          <p className="mt-1 text-sm text-stone-500">{t('settings.language.description')}</p>
        </div>

        <label className="block text-sm font-medium text-stone-700">
          {t('settings.language.label')}
          <select
            value={user?.locale ?? 'en'}
            onChange={(e) => localeMutation.mutate(e.target.value as SupportedLocale)}
            disabled={localeMutation.isPending}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none disabled:opacity-50"
          >
            {SUPPORTED_LOCALES.map((key) => (
              <option key={key} value={key}>
                {LOCALE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        {localeMutation.isSuccess && (
          <p className="text-sm text-green-700">{t('settings.language.saved')}</p>
        )}
        {localeMutation.isError && (
          <p className="text-sm text-red-600">{localeMutation.error?.message}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h1 className="font-serif text-2xl text-stone-900">{t('settings.ai.title')}</h1>
          <p className="mt-1 text-sm text-stone-500">{t('settings.ai.description')}</p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-stone-700">
            {t('settings.ai.provider')}
            <select
              required
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as AiProvider | '');
                setAvailableModels(null);
              }}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
            >
              <option value="">{t('settings.ai.selectProvider')}</option>
              {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((key) => (
                <option key={key} value={key}>
                  {PROVIDER_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-stone-700">
            {t('settings.ai.baseUrl')}
            {baseUrlRequired ? '' : ` ${t('settings.ai.baseUrlOptional')}`}
            <input
              type="text"
              required={baseUrlRequired}
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setAvailableModels(null);
              }}
              placeholder={
                provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.example.com/v1'
              }
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
            />
          </label>

          {provider === 'ollama' ? (
            <p className="text-xs text-stone-500">{t('settings.ai.ollamaNote')}</p>
          ) : (
            <>
              <label className="block text-sm font-medium text-stone-700">
                {t('settings.ai.apiKey')}
                {provider === 'custom' ? ` ${t('settings.ai.optional')}` : ''}
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setClearApiKey(false);
                  }}
                  placeholder={
                    hasApiKey && !clearApiKey ? t('settings.ai.apiKeySavedPlaceholder') : 'sk-...'
                  }
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
                />
              </label>
              {hasApiKey && (
                <label className="flex items-center gap-2 text-sm text-stone-600">
                  <input
                    type="checkbox"
                    checked={clearApiKey}
                    onChange={(e) => {
                      setClearApiKey(e.target.checked);
                      if (e.target.checked) setApiKey('');
                    }}
                  />
                  {t('settings.ai.clearApiKey')}
                </label>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => checkConnectionMutation.mutate()}
            disabled={checkConnectionMutation.isPending}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100 disabled:opacity-50"
          >
            {checkConnectionMutation.isPending
              ? t('settings.ai.checking')
              : t('settings.ai.checkConnection')}
          </button>

          {checkConnectionMutation.isError && (
            <p className="text-sm text-red-600">{t('settings.ai.connectionError')}</p>
          )}

          <label className="block text-sm font-medium text-stone-700">
            {t('settings.ai.model')}
            {availableModels && availableModels.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
              >
                <option value="">{t('settings.ai.selectModel')}</option>
                {availableModels.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider === 'ollama' ? 'llama3.1:8b' : 'gpt-4o-mini'}
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
              />
            )}
          </label>
        </div>

        {saveMutation.isError && <p className="text-red-600">{saveMutation.error?.message}</p>}
        {saveMutation.isSuccess && (
          <p className="text-sm text-green-700">{t('settings.ai.saved')}</p>
        )}

        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
        >
          {saveMutation.isPending ? t('settings.ai.saving') : t('settings.ai.saveSettings')}
        </button>
      </form>

      <div className="space-y-3 rounded-md border border-red-300 p-4">
        <h2 className="font-serif text-xl text-red-900">{t('settings.dangerZone.title')}</h2>
        <p className="text-sm text-stone-600">{t('settings.dangerZone.description')}</p>

        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-md border border-red-600 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50"
        >
          {t('settings.dangerZone.deleteAccount')}
        </button>
      </div>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open);
          if (!open) setDeletePassword('');
        }}
        title={t('settings.dangerZone.dialogTitle')}
        description={t('settings.dangerZone.description')}
      >
        <form onSubmit={handleDeleteSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-stone-700">
            {t('settings.dangerZone.confirmPassword')}
            <input
              type="password"
              required
              autoFocus
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
            />
          </label>

          {deleteAccountMutation.isError && (
            <p className="text-sm text-red-600">{deleteAccountMutation.error?.message}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={deleteAccountMutation.isPending}
              className="rounded-md bg-red-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {deleteAccountMutation.isPending
                ? t('settings.dangerZone.deleting')
                : t('settings.dangerZone.permanentlyDelete')}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletePassword('');
              }}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
