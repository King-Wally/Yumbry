import { Link, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import RecipeListPage from './pages/RecipeListPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeFormPage from './pages/RecipeFormPage';
import ImportPage from './pages/ImportPage';
import AiChatPage from './pages/AiChatPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './hooks/useAuth';
import { useAiStatus } from './hooks/useAiStatus';
import { version } from '../package.json';
import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu';

export default function App() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { data: aiStatus } = useAiStatus({ enabled: Boolean(user) });

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="font-serif text-2xl tracking-tight text-stone-900 transition-colors hover:text-clay"
          >
            Yumbry
          </Link>
          <nav className="text-sm font-medium text-stone-600">
            {user && (
              <NavigationMenuPrimitive.Root className="relative flex items-center gap-2">
                <NavigationMenuPrimitive.List>
                  <NavigationMenuPrimitive.Item>
                    <NavigationMenuPrimitive.Trigger className="px-3 py-1.5 rounded-md transition hover:bg-stone-100 hover:text-clay data-[state=open]:bg-stone-100 data-[state=open]:text-clay">
                      {t('nav.addRecipe')}
                    </NavigationMenuPrimitive.Trigger>
                    <NavigationMenuPrimitive.Content className="absolute top-full left-1/2 transform -translate-x-1/2 text-nowrap mt-2 rounded-md bg-white shadow-lg border border-stone-200">
                      <div className="flex flex-col">
                        <Link to="/recipes/new" className="px-5 py-2 transition hover:bg-stone-100">
                          {t('nav.manually')}
                        </Link>
                        <hr className="h-px bg-stone-200" />
                        <Link to="/import" className="px-5 py-2 transition hover:bg-stone-100">
                          {t('nav.import')}
                        </Link>
                        <hr className="h-px bg-stone-200" />
                        <Link to="/import" className="px-5 py-2 transition hover:bg-stone-100">
                          {t('nav.paste')}
                        </Link>
                        {aiStatus?.configured && (
                          <>
                            <hr className="h-px bg-stone-200" />
                            <Link
                              to="/create-with-ai"
                              className="px-5 py-2 transition hover:bg-stone-100"
                            >
                              {t('nav.createWithAi')}
                            </Link>
                          </>
                        )}
                      </div>
                    </NavigationMenuPrimitive.Content>
                  </NavigationMenuPrimitive.Item>
                </NavigationMenuPrimitive.List>
                <NavigationMenuPrimitive.List>
                  <NavigationMenuPrimitive.Item>
                    <NavigationMenuPrimitive.Trigger className="px-3 py-1.5 rounded-md transition hover:bg-stone-100 hover:text-clay data-[state=open]:bg-stone-100 data-[state=open]:text-clay">
                      {t('nav.profile')}
                    </NavigationMenuPrimitive.Trigger>
                    <NavigationMenuPrimitive.Content className="absolute top-full right-0 mt-2 text-nowrap rounded-md bg-white shadow-lg border border-stone-200">
                      <div className="flex flex-col">
                        <Link to="/settings" className="px-5 py-2 transition hover:bg-stone-100">
                          {t('nav.settings')}
                        </Link>
                        <hr className="h-px bg-stone-200" />
                        <button
                          type="button"
                          onClick={() => logout()}
                          className="px-5 py-2 transition hover:bg-stone-100"
                        >
                          {t('nav.logOut')}
                        </button>
                      </div>
                    </NavigationMenuPrimitive.Content>
                  </NavigationMenuPrimitive.Item>
                </NavigationMenuPrimitive.List>
              </NavigationMenuPrimitive.Root>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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

      <footer className="mx-auto max-w-7xl px-6 py-4 text-center text-xs text-stone-400">
        v{version}
      </footer>
    </div>
  );
}
