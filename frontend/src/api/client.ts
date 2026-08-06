import type {
  AiChatTurnRequest,
  AiChatTurnResponse,
  AiProvider,
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
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!res.ok) {
    const body: ApiErrorBody = await res.json().catch(() => ({}));
    const kind = res.status === 401 ? 'unauthenticated' : body.kind;
    throw new ApiError(body.error || `Request failed with status ${res.status}`, kind);
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

export function importRecipeFromUrl(url: string) {
  return request<RecipeInput>('/recipes/import-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
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

export function updateAiSettings(data: {
  provider: AiProvider;
  base_url: string | null;
  model: string | null;
  api_key?: string | null;
}) {
  return request<AiSettings>('/ai/settings', { method: 'PUT', body: JSON.stringify(data) });
}

export function listAiModels(baseUrl?: string, provider?: AiProvider) {
  const params = new URLSearchParams();
  if (baseUrl) params.set('base_url', baseUrl);
  if (provider) params.set('provider', provider);
  const query = params.toString();
  return request<{ models: { name: string }[] }>(`/ai/settings/models${query ? `?${query}` : ''}`);
}

export function chatAboutRecipe(data: AiChatTurnRequest) {
  return request<AiChatTurnResponse>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface CurrentUser {
  id: number;
  email: string;
}

export function getCurrentUser() {
  return request<CurrentUser>('/auth/me');
}

export function login(email: string, password: string) {
  return request<CurrentUser>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string) {
  return request<CurrentUser>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request<null>('/auth/logout', { method: 'POST' });
}

export function deleteAccount(password: string) {
  return request<null>('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) });
}

export function forgotPassword(email: string) {
  return request<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string) {
  return request<{ id: number }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}
