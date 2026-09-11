import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import RecipeListPage from './pages/RecipeListPage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeFormPage from './pages/RecipeFormPage';
import ImportPage from './pages/ImportPage';
import UrlImportPage from './pages/UrlImportPage';
import AiChatPage from './pages/AiChatPage';
import SettingsPage from './pages/SettingsPage';
import JoinFamilyPage from './pages/JoinFamilyPage';
import OnboardingPage from './pages/OnboardingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProtectedRoute from './components/ProtectedRoute';
import { authClient } from './lib/auth-client';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useLocaleSync } from './hooks/useLocaleSync';
import { useAiStatus } from './hooks/useAiStatus';
import { version } from '../package.json';
import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu';
import { UserCircle } from 'lucide-react';

export default function App() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  // Applies the signed-in user's stored language; lived in AuthProvider before.
  useLocaleSync();
  const { data: aiStatus } = useAiStatus({ enabled: Boolean(user) });
  // Onboarding is a distraction-free, full-screen flow with its own header
  // and footer (progress steps, Back/Next) — it opts out of the app chrome
  // rather than being squeezed underneath it.
  const isOnboarding = useLocation().pathname === '/onboarding';

  return (
    <div className="bg-cream flex min-h-screen flex-col">
      {!isOnboarding && (
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link
              to="/"
              className="hover:text-clay font-serif text-2xl tracking-tight text-stone-900 transition-colors"
            >
              Yumbry
            </Link>
            <nav className="text-sm font-medium text-stone-600">
              {user && (
                <NavigationMenuPrimitive.Root className="relative flex items-center gap-2">
                  <NavigationMenuPrimitive.List>
                    <NavigationMenuPrimitive.Item>
                      <NavigationMenuPrimitive.Trigger className="bg-clay hover:bg-clay/90 data-[state=open]:bg-clay/90 rounded-md px-3 py-1.5 text-white transition">
                        {t('nav.addRecipe')}
                      </NavigationMenuPrimitive.Trigger>
                      <NavigationMenuPrimitive.Content className="absolute top-full left-1/2 mt-2 -translate-x-1/2 transform rounded-md border border-stone-200 bg-white text-nowrap shadow-lg">
                        <div className="flex flex-col divide-y divide-stone-200">
                          <Link
                            to="/recipes/new"
                            className="px-5 py-2 transition hover:bg-stone-100"
                          >
                            {t('nav.manually')}
                          </Link>
                          {user?.jsonImportExportEnabled && (
                            <Link to="/import" className="px-5 py-2 transition hover:bg-stone-100">
                              {t('nav.import')}
                            </Link>
                          )}
                          <Link
                            to="/import/url"
                            className="px-5 py-2 transition hover:bg-stone-100"
                          >
                            {t('nav.paste')}
                          </Link>
                          {aiStatus?.configured && (
                            <>
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
                      <NavigationMenuPrimitive.Trigger className="hover:text-clay data-[state=open]:text-clay rounded-full border border-gray-300 p-1.5 transition hover:bg-stone-100 data-[state=open]:bg-stone-100">
                        <UserCircle className="h-5 w-5" />
                      </NavigationMenuPrimitive.Trigger>
                      <NavigationMenuPrimitive.Content className="absolute top-full right-0 mt-2 rounded-md border border-stone-200 bg-white text-nowrap shadow-lg">
                        <div className="flex flex-col divide-y divide-stone-200">
                          <Link to="/settings" className="px-5 py-2 transition hover:bg-stone-100">
                            {t('nav.settings')}
                          </Link>
                          <button
                            type="button"
                            onClick={() => void authClient.signOut()}
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
      )}

      <main
        className={
          isOnboarding ? 'flex flex-1 flex-col' : 'mx-auto w-full max-w-7xl flex-1 px-4 py-6'
        }
      >
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
            path="/import/url"
            element={
              <ProtectedRoute>
                <UrlImportPage />
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
          <Route path="/join-family/:token" element={<JoinFamilyPage />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
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

      {!isOnboarding && (
        <footer className="mx-auto max-w-7xl px-6 py-4 text-center text-xs text-stone-400">
          v{version}
        </footer>
      )}
    </div>
  );
}
