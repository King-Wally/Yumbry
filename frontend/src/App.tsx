import { Link, Route, Routes } from 'react-router-dom';
import RecipeListPage from './pages/RecipeListPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeFormPage from './pages/RecipeFormPage';
import ImportPage from './pages/ImportPage';
import AiChatPage from './pages/AiChatPage';
import SettingsPage from './pages/SettingsPage';
import { version } from '../package.json';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="font-serif text-2xl tracking-tight text-stone-900 transition-colors hover:text-clay"
          >
            Recipe Vault
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-stone-600">
            <Link to="/import" className="transition-colors hover:text-clay">
              Import
            </Link>
            <Link to="/create-with-ai" className="transition-colors hover:text-clay">
              Create with AI
            </Link>
            <Link to="/settings" className="transition-colors hover:text-clay">
              Settings
            </Link>
            <Link
              to="/recipes/new"
              className="rounded-md bg-clay px-3 py-1.5 text-white shadow-sm transition hover:bg-clay/90 hover:shadow"
            >
              Add recipe
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Routes>
          <Route path="/" element={<RecipeListPage />} />
          <Route path="/recipes/new" element={<RecipeFormPage />} />
          <Route path="/recipes/:id" element={<RecipeDetailPage />} />
          <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
          <Route path="/recipes/:id/ai-improve" element={<AiChatPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/create-with-ai" element={<AiChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <footer className="mx-auto max-w-5xl px-6 py-4 text-center text-xs text-stone-400">
        v{version}
      </footer>
    </div>
  );
}
