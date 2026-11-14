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

    expect(host.querySelector('h1')?.textContent?.replace(/\s+/g, ' ')).toBe('Fashion That Lasts!');
    expect(host.querySelector('.tc-model')).toBeNull();
    expect(host.querySelectorAll('.tc-collage-photo')).toHaveLength(3);
    expect(host.querySelector('.tc-photo-right img')).not.toBeNull();
    expect(host.querySelector('.tc-btn')?.textContent).toBe('Explore the edit');
    expect(host.querySelector('.tc-hint')).toBeNull();
    expect(host.querySelector('.tc-mouse')).toBeNull();
    expect(host.querySelectorAll('.tc-card').length).toBe(6);
    expect(host.querySelector('.tc-count')?.textContent).toBe('0 of 6 finds out');
    expect(host.querySelector('.tc-hud-actions a')?.getAttribute('href')).toBe('/new-arrivals');
    expect(host.textContent?.toLowerCase()).not.toContain('circleup cache');
    expect(host.querySelectorAll('.tc-ivy').length).toBe(2);
    expect(host.querySelector('.tc-vine')).toBeNull();
    expect(host.querySelectorAll('.tc-lid [data-lid-outer="true"]').length).toBe(18);
    expect(host.querySelector('.tc-grain')).not.toBeNull();
    expect(host.querySelector('.tc-card')?.getAttribute('tabindex')).toBe('-1');
    expect(host.querySelector('.tc-card img')?.getAttribute('decoding')).toBe('async');

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});

