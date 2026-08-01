import type {
  AiChatTurnRequest,
  AiChatTurnResponse,
  AiSettings,
  Category,
  Recipe,
  RecipeInput,
  RecipeSummary,
  Tag,
} from '../types';

interface ApiErrorBody {
  error?: string;
  kind?: string;
}

export class ApiError extends Error {
  readonly kind?: string;

  constructor(message: string, kind?: string) {
    super(message);
    this.kind = kind;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body: ApiErrorBody = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed with status ${res.status}`, body.kind);
  }

  if (res.status === 204) return null as T;
  return res.json();
}

export function getRecipes({
  search,
  tag,
  category,
}: { search?: string; tag?: string | null; category?: string | null } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (tag) params.set('tag', tag);
  if (category) params.set('category', category);
  const query = params.toString();
  return request<RecipeSummary[]>(`/recipes${query ? `?${query}` : ''}`);
}

export function getRecipe(id: string | number) {
  return request<Recipe>(`/recipes/${id}`);
}

export function createRecipe(data: RecipeInput) {
  return request<Recipe>('/recipes', { method: 'POST', body: JSON.stringify(data) });
}

export function updateRecipe(id: string | number, data: RecipeInput) {
  return request<Recipe>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteRecipe(id: string | number) {
  return request<null>(`/recipes/${id}`, { method: 'DELETE' });
}

export function getRecipeExportUrl(id: string | number) {
  return `/api/recipes/${id}/export`;
}

export function importRecipe({ jsonLd, file }: { jsonLd?: string; file?: File }) {
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    return request<Recipe>('/recipes/import', { method: 'POST', body: formData });
  }
  return request<Recipe>('/recipes/import', { method: 'POST', body: JSON.stringify({ jsonLd }) });
}

export function uploadRecipePhoto(id: string | number, file: File) {
  const formData = new FormData();
  formData.append('photo', file);
  return request<{ image_path: string }>(`/recipes/${id}/photo`, {
    method: 'POST',
    body: formData,
  });
}

export function getTags() {
  return request<Tag[]>('/tags');
}

export function getCategories() {
  return request<Category[]>('/categories');
}

export function getAiSettings() {
  return request<AiSettings>('/ai/settings');
}

export function updateAiSettings(data: { base_url: string; model: string | null }) {
  return request<AiSettings>('/ai/settings', { method: 'PUT', body: JSON.stringify(data) });
}

export function listAiModels(baseUrl?: string) {
  const query = baseUrl ? `?base_url=${encodeURIComponent(baseUrl)}` : '';
  return request<{ models: { name: string }[] }>(`/ai/settings/models${query}`);
}

export function chatAboutRecipe(data: AiChatTurnRequest) {
  return request<AiChatTurnResponse>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
