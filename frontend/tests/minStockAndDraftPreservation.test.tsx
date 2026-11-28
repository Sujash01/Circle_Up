import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLayout } from '../src/admin/components/AdminLayout';
import { ProductFormPage } from '../src/admin/pages/ProductFormPage';

const { mockShowToast, mockCreateProduct, mockAuthState } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockCreateProduct: vi.fn(),
  mockAuthState: vi.fn(),
}));

vi.mock('../src/admin/context/AdminToastContext', () => ({
  useAdminToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../src/admin/context/AdminAuthContext', () => ({
  useAdminAuth: () => mockAuthState(),
}));

vi.mock('../src/admin/services/adminApi', () => ({
  adminApi: {
    createProduct: mockCreateProduct,
    updateProduct: vi.fn(),
    getProduct: vi.fn(),
    uploadMedia: vi.fn(),
    deleteMedia: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Minimum Stock 15, Product Draft Preservation & Session Warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
    mockCreateProduct.mockResolvedValue({ id: 'new-1' });
    mockAuthState.mockReturnValue({
      user: { id: 'u1', email: 'owner@circleup.in', name: 'Owner', role: 'owner', permissions: [] },
      isOwner: true,
      hasPermission: () => true,
      sessionExpired: false,
      sessionWarningRemainingMs: null,
      renewSession: vi.fn().mockResolvedValue(true),
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('blocks creating a New With Tags product with stock < 15 without auto-adjusting the entered value', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/new']}>
          <Routes>
            <Route path="/admin/products/new" element={<ProductFormPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const findFieldByLabel = <T extends HTMLElement>(labelText: string, selector: string): T => {
      const label = Array.from(container.querySelectorAll('label')).find((l) =>
        l.textContent?.includes(labelText),
      );
      const field = label?.parentElement?.querySelector(selector);
      if (!field) throw new Error(`Missing field for label: ${labelText}`);
      return field as T;
    };

    const nameInput = findFieldByLabel<HTMLInputElement>('Product Name', 'input');
    const priceInput = findFieldByLabel<HTMLInputElement>('Selling Price', 'input');
    const stockInput = findFieldByLabel<HTMLInputElement>('Total Stock', 'input');
    const conditionSelect = findFieldByLabel<HTMLSelectElement>('Condition', 'select');

    act(() => {
      const setVal = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(el, value);
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      };
      setVal(nameInput, 'Fresh Studio Shirt');
      setVal(priceInput, '1499');
      setVal(stockInput, '10');
      setVal(conditionSelect, 'New With Tags');
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('type') === 'submit',
    ) as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    expect(mockCreateProduct).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Minimum stock quantity for a new product is 15.');
    expect(stockInput.value).toBe('10');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('offers Restore Draft when an unsaved draft exists without storing auth tokens', async () => {
    localStorage.setItem(
      'circleup_admin_product_draft:new',
      JSON.stringify({
        savedAt: '2026-11-28T14:00:00.000Z',
        name: 'Saved Radio Draft',
        slug: 'saved-radio-draft',
        autoSlug: false,
        serialNumber: 'CU-EX-099',
        description: 'Restored draft description',
        priceRupees: '2200',
        originalPriceRupees: '',
        compareAtPriceRupees: '',
        stock: '1',
        categoryCode: 'EX',
        sizeCategory: '',
        measurementsData: {},
        category: 'thrifted-treasure',
        subcategory: 'Electronics & Radio',
        condition: 'Vintage Wear',
        gender: 'Unisex',
        badge: '',
        tagsStr: 'thrift',
        featured: false,
        chestPick: false,
        status: 'AVAILABLE',
        selectedSizes: ['One Size'],
        sizeStocks: { 'One Size': 1 },
        variantPrices: {},
        variantMeasurements: {},
        images: [],
      }),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/new']}>
          <Routes>
            <Route path="/admin/products/new" element={<ProductFormPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Unsaved product draft found');
    const restoreBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Restore Draft'),
    );
    expect(restoreBtn).toBeDefined();

    act(() => {
      restoreBtn?.click();
    });

    const nameLabel = Array.from(container.querySelectorAll('label')).find((l) =>
      l.textContent?.includes('Product Name'),
    );
    const nameInput = nameLabel?.parentElement?.querySelector('input') as HTMLInputElement | null;
    expect(nameInput?.value).toBe('Saved Radio Draft');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows session expiry warning banner with Continue Session and preserves form children when expired', async () => {
    const renewSession = vi.fn().mockResolvedValue(true);
    mockAuthState.mockReturnValue({
      user: { id: 'u1', email: 'owner@circleup.in', name: 'Owner', role: 'owner', permissions: [] },
      isOwner: true,
      hasPermission: () => true,
      sessionExpired: false,
      sessionWarningRemainingMs: 3 * 60 * 1000,
      renewSession,
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/new']}>
          <AdminLayout>
            <div data-testid="form-sentinel">Unsaved Form Content</div>
          </AdminLayout>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('will expire in about 3 minutes');
    const continueBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Continue Session'),
    );
    await act(async () => {
      continueBtn?.click();
    });
    expect(renewSession).toHaveBeenCalledTimes(1);

    mockAuthState.mockReturnValue({
      user: { id: 'u1', email: 'owner@circleup.in', name: 'Owner', role: 'owner', permissions: [] },
      isOwner: true,
      hasPermission: () => true,
      sessionExpired: true,
      sessionWarningRemainingMs: null,
      renewSession,
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
    });

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/new']}>
          <AdminLayout>
            <div data-testid="form-sentinel">Unsaved Form Content</div>
          </AdminLayout>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Session Expired');
    expect(container.textContent).toContain('Unsaved Form Content');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
