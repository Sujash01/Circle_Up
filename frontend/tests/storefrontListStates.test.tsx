import { AxiosError } from 'axios';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventsPage } from '../src/features/public/EventsPage';
import { RentalsPage } from '../src/features/public/RentalsPage';
import { ReviewsPage } from '../src/features/public/ReviewsPage';
import { storefrontApi } from '../src/services/storefrontApi';

describe('public storefront lists', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['reviews', ReviewsPage, 'getReviews', 'No Reviews Yet'],
    ['rental items', RentalsPage, 'getRentals', 'No rental items available'],
    ['events', EventsPage, 'getEvents', 'There are no events to display right now.'],
  ] as const)('reports loading, network failure, server failure, and an empty response for %s', async (label, Page, method, emptyCopy) => {
    const privateMessage = 'internal database connection string';
    const networkError = new AxiosError(privateMessage, 'ERR_NETWORK');
    const serverError = Object.assign(new AxiosError(privateMessage, 'ERR_BAD_RESPONSE'), { response: { status: 503 } });
    const requests = vi.spyOn(storefrontApi, method)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce([]);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const retry = () => host.querySelector<HTMLButtonElement>('[role="alert"] + button')?.click();
    try {
      act(() => root.render(<MemoryRouter><Page /></MemoryRouter>));
      expect(host.querySelector('[role="status"]')?.textContent).toContain(`Loading ${label}`);
      expect(host.textContent).not.toContain(emptyCopy);
      await act(async () => {});
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('Check your connection');
      expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1);
      expect(host.textContent).not.toContain(privateMessage);
      expect(host.textContent).not.toContain(emptyCopy);

      await act(async () => retry());
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(`We could not load ${label} right now`);
      expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1);
      expect(host.textContent).not.toContain(privateMessage);
      expect(host.textContent).not.toContain(emptyCopy);

      await act(async () => retry());
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(host.textContent).toContain(emptyCopy);
      expect(requests).toHaveBeenCalledTimes(3);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
