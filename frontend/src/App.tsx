import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { store } from './app/store';
import { StoreProvider } from './context/StoreContext';
import { authService } from './services/authService';
import { ErrorBoundary } from './shared/components/guards/ErrorBoundary';

/**
 * Root storefront application wrapping ErrorBoundary, Redux Provider,
 * LocalStorage-backed StoreProvider, and React Router.
 */
export function App() {
  useEffect(() => {
    authService.initializeFromStorage();
  }, []);

  return (
    <ErrorBoundary>
      <Provider store={store}>
        <StoreProvider>
          <RouterProvider router={router} />
        </StoreProvider>
      </Provider>
    </ErrorBoundary>
  );
}
