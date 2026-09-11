import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ToastProvider } from './context/ToastProvider';
import { ApiError } from './api/client';
import { authClient } from './lib/auth-client';
import { registerServiceWorker } from './pwa';
import './i18n';
import './index.css';

registerServiceWorker();

// 401 from any data query: re-read the session so better-auth's store learns it
// is gone, which sends ProtectedRoute to /login. disableCookieCache forces the
// round-trip rather than trusting whatever the client last saw.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.kind === 'unauthenticated') {
        void authClient.getSession({ query: { disableCookieCache: true } });
      }
    },
  }),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
