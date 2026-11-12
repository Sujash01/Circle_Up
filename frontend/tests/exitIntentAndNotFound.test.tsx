import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExitIntentModal } from '../src/components/storefront/ExitIntentModal';
import { StoreProvider } from '../src/context/StoreContext';
import { NotFoundPage } from '../src/features/public/NotFoundPage';

describe('ExitIntentModal & Custom NotFoundPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('opens exit-intent modal immediately into document.body when cursor leaves top edge', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <MemoryRouter>
          <StoreProvider>
            <ExitIntentModal />
          </StoreProvider>
        </MemoryRouter>,
      );
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    // Pointer leaves top edge -> triggers immediately without artificial delay
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseleave', { clientY: 4 }));
    });

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('THRIFT10');

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders custom 404 page with inline search and suggested rails', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain('404');
    expect(host.textContent).toContain('Off the rack');
    expect(host.querySelector('input[type="search"]')).not.toBeNull();
    expect(host.querySelector('a[href="/new-arrivals"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
