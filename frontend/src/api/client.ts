import type {
  AiChatTurnRequest,
  AiChatTurnResponse,
  Category,
  Recipe,
  RecipeInput,
  RecipeSummary,
  Tag,
} from '../types';
import type { Family, SmallVolumeStyle, SupportedLocale, UnitSystem } from 'yumbry-shared';

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

export function getAiStatus() {
  return request<{ configured: boolean }>('/ai/status');
}

export function chatAboutRecipe(data: AiChatTurnRequest) {
  return request<AiChatTurnResponse>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface CurrentUser {
  id: string;
  email: string;
  locale: SupportedLocale;
  unitSystem: UnitSystem;
  smallVolumes: SmallVolumeStyle;
  jsonImportExportEnabled: boolean;
}

/** Partial on purpose: the settings page sends exactly the preference the reader just changed,
 *  so two independent selects can't overwrite each other's value from a stale cache.
 *
 *  Stays on our own endpoint rather than better-auth's updateUser: these columns are
 *  declared with `input: false` server-side so only this route, which validates them
 *  against the shared enums, can write them. */
export function updateProfile(data: {
  locale?: SupportedLocale;
  unitSystem?: UnitSystem;
  smallVolumes?: SmallVolumeStyle;
  jsonImportExportEnabled?: boolean;
}) {
  return request<CurrentUser>('/me', { method: 'PATCH', body: JSON.stringify(data) });
}

/** Whether the server has email configured, and so whether the login page should
 *  offer "forgot password" at all. Lives at /api/config, not /api/auth/config:
 *  that prefix is handled entirely by better-auth. */
export function getAppConfig() {
  return request<{ passwordResetEnabled: boolean }>('/config');
}

export function getFamily() {
  return request<Family>('/family');
}

export function joinFamily(token: string) {
  return request<null>('/family/join', { method: 'POST', body: JSON.stringify({ token }) });
}

export function leaveFamily() {
  return request<null>('/family/leave', { method: 'POST' });
}
