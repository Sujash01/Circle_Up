import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExitIntentModal } from '../src/components/storefront/ExitIntentModal';
import { StoreProvider } from '../src/context/StoreContext';
import { NotFoundPage } from '../src/features/public/NotFoundPage';
import * as storefrontSettings from '../src/services/storefrontSettingsService';

describe('ExitIntentModal & Custom NotFoundPage', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('opens the exit offer only when the pointer leaves through the top edge', () => {
    vi.spyOn(storefrontSettings, 'useStorefrontSettings').mockReturnValue({
      header: { text: '', link: '/new-arrivals', isActive: false },
      automaticCodes: [],
      whatsappNumber: '',
      exitOffer: { code: 'WEEKEND', headline: 'Weekend offer', subtext: 'Browse the offer', badgeText: '10% off', targetPages: ['all'], cooldownHours: 24 },
    });
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

    // Leaving from another edge should not interrupt browsing.
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseout', { clientY: 180 }));
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    // The top edge remains the exit-intent trigger.
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseout', { clientY: 0 }));
    });

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('WEEKEND');
    expect(dialog?.textContent).not.toContain('THRIFT10');
    expect(dialog?.textContent).not.toContain('CIRCLE20');

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('does not open a promotion when none is configured', () => {
    vi.spyOn(storefrontSettings, 'useStorefrontSettings').mockReturnValue({
      header: { text: '', link: '/new-arrivals', isActive: false },
      automaticCodes: [],
      whatsappNumber: '',
      exitOffer: null,
    });
    const root = createRoot(document.createElement('div'));
    try {
      act(() => root.render(<MemoryRouter><StoreProvider><ExitIntentModal /></StoreProvider></MemoryRouter>));
      act(() => document.dispatchEvent(new MouseEvent('mouseout', { clientY: 0 })));
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      act(() => root.unmount());
    }
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
