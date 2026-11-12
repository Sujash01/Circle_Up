import { RouterProvider } from 'react-router-dom';
import { StoreProvider } from './context/StoreContext';
import { router } from './app/router';
import { ErrorBoundary } from './shared/components/guards/ErrorBoundary';

/**
 * Root storefront application wrapping ErrorBoundary, LocalStorage-backed
 * StoreProvider, and React Router.
 */
export function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <RouterProvider router={router} />
      </StoreProvider>
    </ErrorBoundary>
  );
}
