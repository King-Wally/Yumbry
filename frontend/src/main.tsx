import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ApiError } from './api/client';
import './index.css';

registerSW({ immediate: true });

// A 401 mid-session (expired/cleared cookie) means the user is no longer
// logged in from the server's point of view — refetch the auth check so
// AuthContext's `user` flips to null and ProtectedRoute redirects to /login.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.kind === 'unauthenticated') {
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      }
    },
  }),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
