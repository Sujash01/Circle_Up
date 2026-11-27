import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminSidebar } from '../src/admin/components/AdminSidebar';
import { AdminBottomNav } from '../src/admin/components/AdminBottomNav';

const mockAuthState = vi.fn();

vi.mock('../src/admin/context/AdminAuthContext', () => ({
  useAdminAuth: () => mockAuthState(),
}));

describe('Follow-up Fixes: Rentals Navigation Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('shows Rentals & Events in desktop sidebar and mobile nav for owner and staff with rentals_events:manage', () => {
    for (const auth of [
      {
        user: { id: 'u1', email: 'owner@circleup.in', name: 'Owner', role: 'owner', permissions: [] },
        isOwner: true,
        hasPermission: () => true,
        logout: vi.fn(),
      },
      {
        user: { id: 'u2', email: 'staff@circleup.in', name: 'Staff', role: 'staff', permissions: ['rentals_events:manage'] },
        isOwner: false,
        hasPermission: (p: string) => p === 'rentals_events:view' || p === 'rentals_events:manage',
        logout: vi.fn(),
      },
    ]) {
      mockAuthState.mockReturnValue(auth);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <MemoryRouter initialEntries={['/admin/rentals']}>
            <AdminSidebar />
            <AdminBottomNav />
          </MemoryRouter>,
        );
      });

      const initialLinks = Array.from(container.querySelectorAll('a')).filter((a) =>
        a.textContent?.includes('Rentals & Events'),
      );
      expect(initialLinks.length).toBeGreaterThanOrEqual(1);
      expect(initialLinks[0]?.getAttribute('href')).toBe('/admin/rentals-events');

      const moreButton = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('More'),
      );
      expect(moreButton).toBeDefined();

      act(() => {
        moreButton?.click();
      });

      const allLinks = Array.from(container.querySelectorAll('a')).filter((a) =>
        a.textContent?.includes('Rentals & Events'),
      );
      expect(allLinks.length).toBeGreaterThanOrEqual(2);

      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('hides Rentals & Events when staff lacks rentals permissions', () => {
    mockAuthState.mockReturnValue({
      user: { id: 'u3', email: 'limited@circleup.in', name: 'Limited', role: 'staff', permissions: ['orders:view'] },
      isOwner: false,
      hasPermission: (p: string) => p === 'orders:view',
      logout: vi.fn(),
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/admin/overview']}>
          <AdminSidebar />
          <AdminBottomNav />
        </MemoryRouter>,
      );
    });

    const links = Array.from(container.querySelectorAll('a')).filter((a) =>
      a.textContent?.includes('Rentals & Events'),
    );
    expect(links).toHaveLength(0);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
