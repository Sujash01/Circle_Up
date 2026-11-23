import { describe, expect, it } from 'vitest';
import { getOrderTrackingStep } from '../src/services/orderService';

describe('Order Tracking Step Mapping (P0-3 Hardening)', () => {
  it('maps PENDING and CONFIRMED to Step 1 (Order Placed / Confirmed)', () => {
    expect(getOrderTrackingStep('PENDING')).toBe(1);
    expect(getOrderTrackingStep('CONFIRMED')).toBe(1);
  });

  it('maps PACKED to Step 2 (Packaging / Prepared)', () => {
    expect(getOrderTrackingStep('PACKED')).toBe(2);
  });

  it('maps SHIPPED, IN_TRANSIT, and OUT_FOR_DELIVERY to Step 3 (Dispatched / On the Way)', () => {
    expect(getOrderTrackingStep('SHIPPED')).toBe(3);
    expect(getOrderTrackingStep('IN_TRANSIT')).toBe(3);
    expect(getOrderTrackingStep('OUT_FOR_DELIVERY')).toBe(3);
  });

  it('maps DELIVERED to Step 4 (Delivered)', () => {
    expect(getOrderTrackingStep('DELIVERED')).toBe(4);
  });

  it('falls back safely to Step 1 for unknown or initial statuses', () => {
    expect(getOrderTrackingStep('')).toBe(1);
    expect(getOrderTrackingStep('UNKNOWN')).toBe(1);
  });
});
