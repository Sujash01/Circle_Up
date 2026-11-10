import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import { store } from './app/store';
import { ErrorBoundary } from './shared/components/guards/ErrorBoundary';
import { markAuthInitialized } from './store/slices/authSlice';

/**
 * Root application shell wiring Redux store, TanStack Query, ErrorBoundary,
 * and code-split portal routing.
 */
export function App() {
  useEffect(() => {
    // M1 will replace this with silent cookie refresh bootstrap (/auth/refresh).
    store.dispatch(markAuthInitialized());
  }, []);

  return (
    <ErrorBoundary>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </Provider>
    </ErrorBoundary>
  );
}

