import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { listAiModels, updateAiSettings } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useAiSettings } from '../hooks/useAiSettings';
import type { AiProvider } from '../types';

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

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings } = useAiSettings();

  const [provider, setProvider] = useState<AiProvider | ''>('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[] | null>(null);

  // Populate the form during render when settings load, rather than in a
  // useEffect — this is React's documented pattern for initializing editable
  // state from async data without an extra render/flash of stale values.
  if (settings && !loaded) {
    setLoaded(true);
    setProvider(settings.provider ?? '');
    setBaseUrl(settings.base_url ?? '');
    setModel(settings.model ?? '');
    setHasApiKey(settings.has_api_key);
  }

  const checkConnectionMutation = useMutation({
    mutationFn: () => listAiModels(baseUrl || undefined, provider || undefined),
    onSuccess: (res) => setAvailableModels(res.models.map((m) => m.name)),
    onError: () => setAvailableModels(null),
  });

  const saveMutation = useMutation({
    // The Provider <select> is `required`, so the browser blocks form
    // submission (and this mutationFn never runs) until it's non-empty.
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

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-stone-900">AI settings</h1>
        <p className="mt-1 text-sm text-stone-500">
          Choose the AI provider used by the AI assistant features, and configure how to reach it.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-stone-700">
          Provider
          <select
            required
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as AiProvider | '');
              setAvailableModels(null);
            }}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
          >
            <option value="">Select a provider...</option>
            {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((key) => (
              <option key={key} value={key}>
                {PROVIDER_LABELS[key]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-stone-700">
          Base URL{baseUrlRequired ? '' : ' (optional — overrides the provider default)'}
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

        <label className="block text-sm font-medium text-stone-700">
          API key{provider === 'ollama' || provider === 'custom' ? ' (optional)' : ''}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setClearApiKey(false);
            }}
            placeholder={
              hasApiKey && !clearApiKey ? '•••• (saved — leave blank to keep)' : 'sk-...'
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
            Clear the saved API key
          </label>
        )}

        <button
          type="button"
          onClick={() => checkConnectionMutation.mutate()}
          disabled={checkConnectionMutation.isPending}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100 disabled:opacity-50"
        >
          {checkConnectionMutation.isPending ? 'Checking...' : 'Check connection / load models'}
        </button>

        {checkConnectionMutation.isError && (
          <p className="text-sm text-red-600">
            Couldn't reach that provider — you can still type a model name manually below.
          </p>
        )}

        <label className="block text-sm font-medium text-stone-700">
          Model
          {availableModels && availableModels.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
            >
              <option value="">Select a model...</option>
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
      {saveMutation.isSuccess && <p className="text-sm text-green-700">Settings saved.</p>}

      <button
        type="submit"
        disabled={saveMutation.isPending}
        className="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving...' : 'Save settings'}
      </button>
    </form>
  );
}
