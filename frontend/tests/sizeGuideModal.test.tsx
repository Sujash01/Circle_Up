import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SizeGuideModal } from '../src/components/storefront/SizeGuideModal';

describe('SizeGuideModal portal and layering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when closed', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <SizeGuideModal
          isOpen={false}
          onClose={() => {}}
          categorySlug="womens-one-piece"
          productName="Latex Bodysuit"
        />,
      );
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('portals into document.body with z-[70] when open and responds to close actions', () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    // Simulate nested notebook sheet structure
    host.className = 'storefront-notebook-sheet';
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <SizeGuideModal
          isOpen={true}
          onClose={onClose}
          categorySlug="womens-one-piece"
          productName="Flowers Dress"
          measurementsText="L (bust-44', waist-36', hip-64', length-44')"
        />,
      );
    });

    // The modal backdrop should be a direct child of document.body via createPortal
    const dialogBackdrop = document.body.querySelector('[role="dialog"]');
    expect(dialogBackdrop).not.toBeNull();
    expect(dialogBackdrop?.parentElement).toBe(document.body);
    expect(dialogBackdrop?.className).toContain('z-[70]');

    // Contains title and product measurements
    expect(dialogBackdrop?.textContent).toContain('Garment Size & Measurement Guide');
    expect(dialogBackdrop?.textContent).toContain('Flowers Dress');
    expect(dialogBackdrop?.textContent).toContain("L (bust-44', waist-36', hip-64', length-44')");

    // Close button triggers onClose
    const closeBtn = dialogBackdrop?.querySelector('button[aria-label="Close size guide"]') as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    act(() => {
      closeBtn?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape key triggers onClose
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
