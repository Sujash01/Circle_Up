import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TreasureChestHero } from '../src/components/landing/TreasureChestHero';

describe('TreasureChestHero', () => {
  it('mounts 3D treasure chest hero with real product links and cleans up cleanly', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <MemoryRouter>
          <TreasureChestHero />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain('Fashion');
    expect(host.textContent).toContain('That Lasts!');
    expect(host.querySelectorAll('.tc-card').length).toBeGreaterThanOrEqual(4);
    expect(host.querySelectorAll('.tc-ivy').length).toBe(2);

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});

