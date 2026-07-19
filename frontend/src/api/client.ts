import type { Recipe, RecipeInput, RecipeSummary, Tag } from '../types';

interface ApiErrorBody {
  error?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body: ApiErrorBody = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }

  if (res.status === 204) return null as T;
  return res.json();
}

export function getRecipes({ search, tag }: { search?: string; tag?: string | null } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (tag) params.set('tag', tag);
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

export function uploadInstructionPhoto(recipeId: string | number, stepId: number, file: File) {
  const formData = new FormData();
  formData.append('photo', file);
  return request<{ image_path: string }>(`/recipes/${recipeId}/instructions/${stepId}/photo`, {
    method: 'POST',
    body: formData,
  });
}

export function getTags() {
  return request<Tag[]>('/tags');
}
