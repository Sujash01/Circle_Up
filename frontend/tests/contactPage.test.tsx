import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock('@/services/apiClient', () => ({
  apiClient: { post: mockPost },
}));

import { ContactPage } from '../src/features/public/ContactPage';

describe('ContactPage persistence feedback', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function submitContactForm() {
    await act(async () => root.render(<ContactPage />));

    const setValue = (id: string, value: string, isTextarea = false) => {
      const field = container.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
      const prototype = isTextarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    };

    setValue('contact-name', 'Kavya');
    setValue('contact-email', 'kavya@example.com');
    setValue('contact-subject', 'Sizing question');
    setValue('contact-message', 'Could you share the blazer shoulder width?', true);

    await act(async () => {
      container.querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
  }

  it('confirms only after the API reports a persisted inquiry', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 'a62b737e-264b-4ad1-ad89-ae64f21f5b54',
          name: 'Kavya',
          email: 'kavya@example.com',
          subject: 'Sizing question',
          message: 'Could you share the blazer shoulder width?',
          createdAt: '2026-11-22T10:00:00.000Z',
          updatedAt: '2026-11-22T10:00:00.000Z',
        },
      },
    });

    await submitContactForm();

    expect(mockPost).toHaveBeenCalledWith('/contact', {
      name: 'Kavya',
      email: 'kavya@example.com',
      subject: 'Sizing question',
      message: 'Could you share the blazer shoulder width?',
    });
    expect(container.textContent).toContain('Message Sent');
    expect(localStorage.getItem('circleup_contact_submissions_v1')).toBeNull();
  });

  it('shows API failures, keeps the form values, and does not claim success', async () => {
    mockPost.mockRejectedValueOnce(new Error('Contact submissions are temporarily unavailable.'));

    await submitContactForm();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Contact submissions are temporarily unavailable.',
    );
    expect(container.textContent).not.toContain('Message Sent');
    expect((container.querySelector('#contact-name') as HTMLInputElement).value).toBe('Kavya');
  });
});
