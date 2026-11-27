import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/shared/components/guards/ErrorBoundary';
import { RouteErrorBoundary } from '../src/app/router';

function ThrowRawError(): never {
  throw new Error('Minified React error #31; SQLSTATE 42P01 at /src/secret.ts:12');
}

describe('Friendly Error Handling Across CircleUp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('ErrorBoundary hides raw React/SQL errors, logs diagnostics, and shows Try Again + Go Home', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ErrorBoundary>
          <ThrowRawError />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain('Something went wrong. Please try again.');
    expect(container.textContent).toContain('Try Again');
    expect(container.textContent).toContain('Go Home');
    expect(container.textContent).not.toContain('Minified React error #31');
    expect(container.textContent).not.toContain('SQLSTATE');
    expect(container.textContent).not.toContain('/src/secret.ts');
    expect(consoleSpy).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('RouteErrorBoundary hides raw error.message and renders friendly fallback with Try Again + Go Home', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const testRouter = createMemoryRouter(
      [
        {
          path: '/',
          element: <ThrowRawError />,
          errorElement: <RouteErrorBoundary />,
        },
      ],
      { initialEntries: ['/'] },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RouterProvider router={testRouter} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Something went wrong. Please try again.');
    expect(container.textContent).toContain('Try Again');
    expect(container.textContent).toContain('Go Home');
    expect(container.textContent).not.toContain('Minified React error #31');
    expect(container.textContent).not.toContain('SQLSTATE');
    expect(consoleSpy).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
