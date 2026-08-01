import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAiSettings, listAiModels, updateAiSettings } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: queryKeys.aiSettings,
    queryFn: getAiSettings,
  });

  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[] | null>(null);

  // Populate the form during render when settings load, rather than in a
  // useEffect — this is React's documented pattern for initializing editable
  // state from async data without an extra render/flash of stale values.
  if (settings && !loaded) {
    setLoaded(true);
    setBaseUrl(settings.base_url);
    setModel(settings.model ?? '');
  }

  const checkConnectionMutation = useMutation({
    mutationFn: () => listAiModels(baseUrl),
    onSuccess: (res) => setAvailableModels(res.models.map((m) => m.name)),
    onError: () => setAvailableModels(null),
  });

  const saveMutation = useMutation({
    mutationFn: () => updateAiSettings({ base_url: baseUrl, model: model || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiSettings });
    },
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    saveMutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-stone-900">AI settings</h1>
        <p className="mt-1 text-sm text-stone-500">
          Configure the Ollama server used by the AI assistant features. It can run on a different
          machine on your local network.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-stone-700">
          Ollama base URL
          <input
            type="text"
            required
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setAvailableModels(null);
            }}
            placeholder="http://localhost:11434"
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => checkConnectionMutation.mutate()}
          disabled={!baseUrl || checkConnectionMutation.isPending}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100 disabled:opacity-50"
        >
          {checkConnectionMutation.isPending ? 'Checking...' : 'Check connection / load models'}
        </button>

        {checkConnectionMutation.isError && (
          <p className="text-sm text-red-600">
            Couldn't reach that address — you can still type a model name manually below.
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
              placeholder="llama3.1:8b"
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
