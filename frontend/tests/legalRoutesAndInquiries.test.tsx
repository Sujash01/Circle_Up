import React from 'react';
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PrivacyPolicyPage } from '../src/features/public/PrivacyPolicyPage';
import { TermsPage } from '../src/features/public/TermsPage';
import { ReturnsRefundsPage } from '../src/features/public/ReturnsRefundsPage';
import { ShippingPolicyPage } from '../src/features/public/ShippingPolicyPage';

describe('Frontend Legal Policies & Terms Suites (P2-7)', () => {
  it('renders PrivacyPolicyPage with ethical privacy commitment', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BrowserRouter>
          <PrivacyPolicyPage />
        </BrowserRouter>
      );
    });

    expect(container.textContent).toContain('Privacy Policy');
    expect(container.textContent).toContain('Our Commitment to Your Privacy');
    expect(container.textContent).toContain('care@circleuponline.com');

    // Confirm AGENTS.md rule: Zero model photos anywhere
    const images = container.querySelectorAll('img');
    expect(images.length).toBe(0);

    root.unmount();
    container.remove();
  });

  it('renders TermsPage with one-of-one vintage piece terms', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BrowserRouter>
          <TermsPage />
        </BrowserRouter>
      );
    });

    expect(container.textContent).toContain('Terms & Conditions');
    expect(container.textContent).toContain('Unique & One-of-One Vintage Pieces');
    expect(container.textContent).toContain('Integer Paise Precision');

    root.unmount();
    container.remove();
  });

  it('renders ReturnsRefundsPage with 7-day pre-loved return window', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BrowserRouter>
          <ReturnsRefundsPage />
        </BrowserRouter>
      );
    });

    expect(container.textContent).toContain('Returns & Refunds Policy');
    expect(container.textContent).toContain('7-Day Pre-Loved Return Window');
    expect(container.textContent).toContain('Condition & Inspection Criteria');

    root.unmount();
    container.remove();
  });

  it('renders ShippingPolicyPage with the ₹1,000 complimentary shipping threshold and ₹90 flat fee', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BrowserRouter>
          <ShippingPolicyPage />
        </BrowserRouter>
      );
    });

    expect(container.textContent).toContain('Shipping & Delivery Policy');
    expect(container.textContent).toContain('₹1,000');
    expect(container.textContent).toContain('₹90');
    expect(container.textContent).toContain('Empty bags have no shipping charge');
    expect(container.textContent).toContain('Eco-Friendly Packaging');

    root.unmount();
    container.remove();
  });
});
