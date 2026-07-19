import { Route, Routes } from 'react-router-dom';
import RecipeListPage from './pages/RecipeListPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeFormPage from './pages/RecipeFormPage';
import ImportPage from './pages/ImportPage';

export default function App() {
  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a
            href="/"
            className="font-serif text-2xl tracking-tight text-stone-900 transition-colors hover:text-clay"
          >
            Recipe Vault
          </a>
          <nav className="flex items-center gap-5 text-sm font-medium text-stone-600">
            <a href="/import" className="transition-colors hover:text-clay">
              Import
            </a>
            <a
              href="/recipes/new"
              className="rounded-md bg-clay px-3 py-1.5 text-white shadow-sm transition hover:bg-clay/90 hover:shadow"
            >
              Add recipe
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route path="/" element={<RecipeListPage />} />
          <Route path="/recipes/new" element={<RecipeFormPage />} />
          <Route path="/recipes/:id" element={<RecipeDetailPage />} />
          <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </main>
    </div>
  );
}
