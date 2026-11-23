import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PackingSlipModal } from '../src/admin/components/PackingSlipModal';
import type { Order } from '@circleup/shared';

const baseOrder: Order = {
  id: 'order-1234',
  orderNumber: 'ORD-202611-TEST001',
  customer: {
    name: 'Priya Sharma',
    email: 'priya@example.com',
    phone: '+919876543210',
  },
  shippingAddress: {
    addressLine: '14 Rosewood Lane',
    city: 'Chandigarh',
    state: 'Punjab',
    postalCode: '160019',
    country: 'India',
  },
  items: [
    {
      serialNumber: 'CU-SHIRT-001',
      name: 'Archival Silk Shirt',
      price: 255000,
      quantity: 1,
      size: 'M',
    },
  ],
  subtotal: 255000,
  discount: 0,
  deliveryFee: 0,
  totalAmount: 255000,
  status: 'CONFIRMED',
  paymentMethod: 'CASH_ON_DELIVERY',
  paymentStatus: 'PENDING',
  createdAt: '2026-11-20T10:00:00.000Z',
};

describe('PackingSlipModal Payment & Billing States (Resolves P1-7)', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  });

  it('renders "Amount Due on Delivery" and collect line for unpaid COD orders', async () => {
    const root = createRoot(host);
    await act(async () => {
      root.render(<PackingSlipModal order={baseOrder} onClose={vi.fn()} />);
    });

    // Must NOT display "Total Paid" when payment is pending
    expect(host.textContent).not.toContain('Total Paid');

    // Renders accurate billing state and collection amount
    expect(host.textContent).toContain('Amount Due on Delivery');
    expect(host.textContent).toContain('Payment Due on Delivery (COD)');
    expect(host.textContent).toContain('Amount to Collect');
    expect(host.textContent).toContain('₹2,550');
  });

  it('renders "Total Paid" with verified badge for paid orders', async () => {
    const paidOrder: Order = {
      ...baseOrder,
      paymentMethod: 'WHATSAPP_UPI',
      paymentStatus: 'PAID',
    };
    const root = createRoot(host);
    await act(async () => {
      root.render(<PackingSlipModal order={paidOrder} onClose={vi.fn()} />);
    });

    expect(host.textContent).toContain('Total Paid');
    expect(host.textContent).toContain('Paid in Full');
    expect(host.textContent).not.toContain('Amount to Collect');
  });

  it('renders "Refunded Amount" and "Net Amount Due: ₹0" for refunded orders', async () => {
    const refundedOrder: Order = {
      ...baseOrder,
      status: 'REFUNDED',
      paymentStatus: 'REFUNDED',
    };
    const root = createRoot(host);
    await act(async () => {
      root.render(<PackingSlipModal order={refundedOrder} onClose={vi.fn()} />);
    });

    expect(host.textContent).not.toContain('Total Paid');
    expect(host.textContent).toContain('Refunded Amount');
    expect(host.textContent).toContain('Refunded');
    expect(host.textContent).toContain('Net Amount Due');
    expect(host.textContent).toContain('₹0');
  });

  it('renders "Order Value (Cancelled)" and cancel status for cancelled orders', async () => {
    const cancelledOrder: Order = {
      ...baseOrder,
      status: 'CANCELLED',
    };
    const root = createRoot(host);
    await act(async () => {
      root.render(<PackingSlipModal order={cancelledOrder} onClose={vi.fn()} />);
    });

    expect(host.textContent).not.toContain('Total Paid');
    expect(host.textContent).toContain('Order Value (Cancelled)');
    expect(host.textContent).toContain('Cancelled');
  });

  it('renders structured tax invoice and business identification details', async () => {
    const root = createRoot(host);
    await act(async () => {
      root.render(<PackingSlipModal order={baseOrder} onClose={vi.fn()} />);
    });

    expect(host.textContent).toContain('Sector 7 Studio Courtyard, Madhya Marg, Chandigarh 160019');
    expect(host.textContent).toContain('GSTIN: 03AABCC1234F1Z8');
    expect(host.textContent).toContain('Tax Invoice / Packing Slip');
  });
});
