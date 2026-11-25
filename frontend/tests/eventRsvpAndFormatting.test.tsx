import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventDetailPage } from '../src/features/public/EventDetailPage';
import { eventService } from '../src/services/communityServices';
import { formatDisplaySerial, cleanSizeLabel } from '@circleup/shared';

describe('EventDetailPage RSVP Hardening & Formatting', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders RSVP form with name, email, phone, and submit button', async () => {
    vi.spyOn(eventService, 'getEventById').mockResolvedValue({
      id: 'test-evt',
      title: 'Studio Thrift Swap',
      description: 'Community clothes swap',
      fullDetails: 'Full details of swap',
      date: 'Sunday, 15 Dec',
      time: '2 PM',
      location: 'CircleUp Courtyard',
      image: '/test.webp',
      spotsLabel: '20 spots remaining',
      highlights: ['Swap 5 items'],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<EventDetailPage />} />
          </Routes>
        </BrowserRouter>,
      );
    });

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.textContent).toContain('RSVP for Event');
    expect(submitBtn.disabled).toBe(false);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('displays error and handles 409 duplicate registration gracefully without unhandled rejection', async () => {
    vi.spyOn(eventService, 'getEventById').mockResolvedValue({
      id: 'test-evt-2',
      title: 'Denim Workshop',
      description: 'Mending',
      fullDetails: 'Details',
      date: 'Sunday, 15 Dec',
      time: '2 PM',
      location: 'CircleUp',
      image: '/test.webp',
      spotsLabel: '10 spots',
      highlights: [],
    });

    vi.spyOn(eventService, 'registerForEvent').mockResolvedValue({
      error: 'A registration for this email has already been received for this event.',
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<EventDetailPage />} />
          </Routes>
        </BrowserRouter>,
      );
    });

    const setValue = (id: string, value: string) => {
      const field = host.querySelector(`#${id}`) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    };

    await act(async () => {
      setValue('evt-name', 'Tara Mehta');
      setValue('evt-email', 'tara@example.com');
      setValue('evt-phone', '+91 9820112233');
    });

    const form = host.querySelector('form') as HTMLFormElement;

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const alert = host.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('already been received');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('verifies clean size and serial formatters integration', () => {
    expect(cleanSizeLabel("L {Kurti (bust-46')}")).toBe('L');
    expect(cleanSizeLabel("S-M (chest-38')")).toBe('S-M');
    expect(formatDisplaySerial('3504', '4b00bddd-5e4d-47e3-883d-dd48d57775a5')).toBe('3504');
    expect(formatDisplaySerial('4b00bddd-5e4d-47e3-883d-dd48d57775a5', '4b00bddd-5e4d-47e3-883d-dd48d57775a5')).toBe('CU-4B00BD');
    expect(formatDisplaySerial(undefined, '4b00bddd-5e4d-47e3-883d-dd48d57775a5')).toBe('CU-4B00BD');
  });
});
