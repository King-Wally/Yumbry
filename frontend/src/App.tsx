import { Link, Route, Routes } from 'react-router-dom';
import RecipeListPage from './pages/RecipeListPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeFormPage from './pages/RecipeFormPage';
import ImportPage from './pages/ImportPage';
import AiChatPage from './pages/AiChatPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { useAiSettings } from './hooks/useAiSettings';
import { version } from '../package.json';

export default function App() {
  const { user, logout } = useAuth();
  const { data: aiSettings } = useAiSettings({ enabled: Boolean(user) });

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
            {user && (
              <>
                <Link to="/import" className="transition-colors hover:text-clay">
                  Import
                </Link>
                {aiSettings?.model && (
                  <Link to="/create-with-ai" className="transition-colors hover:text-clay">
                    Create with AI
                  </Link>
                )}
                <Link to="/settings" className="transition-colors hover:text-clay">
                  Settings
                </Link>
                <Link
                  to="/recipes/new"
                  className="rounded-md bg-clay px-3 py-1.5 text-white shadow-sm transition hover:bg-clay/90 hover:shadow"
                >
                  Add recipe
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="transition-colors hover:text-clay"
                >
                  Log out
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <RecipeListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recipes/new"
            element={
              <ProtectedRoute>
                <RecipeFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recipes/:id"
            element={
              <ProtectedRoute>
                <RecipeDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recipes/:id/edit"
            element={
              <ProtectedRoute>
                <RecipeFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recipes/:id/ai-improve"
            element={
              <ProtectedRoute>
                <AiChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/import"
            element={
              <ProtectedRoute>
                <ImportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create-with-ai"
            element={
              <ProtectedRoute>
                <AiChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>

      <footer className="mx-auto max-w-5xl px-6 py-4 text-center text-xs text-stone-400">
        v{version}
      </footer>
    </div>
  );
}
