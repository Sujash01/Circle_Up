import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ScrollIvyBranch } from '../src/components/landing/ScrollIvyBranch';

describe('ScrollIvyBranch', () => {
  it('mounts decorative single-vine SVG stem without crashing in jsdom', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const containerRef = createRef<HTMLElement>();
    const mainEl = document.createElement('main');
    document.body.appendChild(mainEl);
    (containerRef as { current: HTMLElement | null }).current = mainEl;

    const root = createRoot(host);
    act(() => {
      root.render(<ScrollIvyBranch containerRef={containerRef} />);
    });

    const vineWrapper = host.querySelector('[aria-hidden="true"]');
    expect(vineWrapper).not.toBeNull();
    expect(vineWrapper?.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);

    act(() => {
      root.unmount();
    });
    host.remove();
    mainEl.remove();
  });
});

