import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamManagementPage from '../src/admin/pages/TeamManagementPage';
import { AdminSidebar } from '../src/admin/components/AdminSidebar';
import { ProductsPage } from '../src/admin/pages/ProductsPage';
import { adminApi } from '../src/admin/services/adminApi';
import { AdminToastProvider } from '../src/admin/context/AdminToastContext';
import { AdminAuthProvider } from '../src/admin/context/AdminAuthContext';
import type { AdminUser, Product } from '@circleup/shared';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Team Management & Granular Permissions UI', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockOwnerUser: AdminUser = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Owner Admin',
    email: 'owner@circleup.in',
    role: 'owner',
    isActive: true,
    permissions: [],
  };

  const mockStaffUser: AdminUser = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Staff Member',
    email: 'staff@circleup.in',
    role: 'staff',
    isActive: true,
    permissions: ['products:view', 'orders:view'],
  };

  const sampleTeamList: AdminUser[] = [
    mockOwnerUser,
    mockStaffUser,
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Catalog Assistant',
      email: 'catalog@circleup.in',
      role: 'staff',
      isActive: false,
      permissions: ['products:view', 'products:create', 'products:edit'],
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function setInputValue(input: HTMLInputElement, value: string) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('renders Team Accounts in sidebar for owner, but hides it for staff', async () => {
    // 1. As owner
    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: mockOwnerUser,
      csrfToken: 'test-csrf',
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin']}>
          <AdminAuthProvider>
            <AdminSidebar />
          </AdminAuthProvider>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('Team Accounts');

    // Unmount before testing staff
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);

    // 2. As staff
    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: mockStaffUser,
      csrfToken: 'test-csrf',
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin']}>
          <AdminAuthProvider>
            <AdminSidebar />
          </AdminAuthProvider>
        </MemoryRouter>
      );
    });

    expect(container.textContent).not.toContain('Team Accounts');
  });

  it('renders team accounts list with roles and assigned permissions count', async () => {
    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: mockOwnerUser,
      csrfToken: 'test-csrf',
    });
    vi.spyOn(adminApi, 'getAdminUsers').mockResolvedValue(sampleTeamList);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/team']}>
          <AdminToastProvider>
            <AdminAuthProvider>
              <TeamManagementPage />
            </AdminAuthProvider>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('Team Accounts & Access Control');
    expect(container.textContent).toContain('Owner Admin');
    expect(container.textContent).toContain('Staff Member');
    expect(container.textContent).toContain('Catalog Assistant');
    expect(container.textContent).toContain('Full Access (Owner)');
    expect(container.textContent).toContain('2 of 21 permissions');
    expect(container.textContent).toContain('Deactivated');
  });

  it('opens add team member modal and saves new staff user with granular permissions', async () => {
    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: mockOwnerUser,
      csrfToken: 'test-csrf',
    });
    vi.spyOn(adminApi, 'getAdminUsers').mockResolvedValue(sampleTeamList);

    const createSpy = vi.spyOn(adminApi, 'createAdminUser').mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      name: 'New Mod',
      email: 'newmod@circleup.in',
      role: 'staff',
      isActive: true,
      permissions: ['overview:view', 'products:view', 'products:create'],
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/team']}>
          <AdminToastProvider>
            <AdminAuthProvider>
              <TeamManagementPage />
            </AdminAuthProvider>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    // Click "Add Team Member"
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Team Member')
    );
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn?.click();
    });

    expect(container.textContent).toContain('Create New Team Member');

    // Fill form
    const nameInput = container.querySelector('input[placeholder="e.g. Priyanshi Sharma"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[placeholder="name@circleup.com"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;

    expect(nameInput).toBeDefined();
    expect(emailInput).toBeDefined();
    expect(passwordInput).toBeDefined();

    await act(async () => {
      setInputValue(nameInput, 'New Mod');
      setInputValue(emailInput, 'newmod@circleup.in');
      setInputValue(passwordInput, 'Password123!');
    });

    // Submit form
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Mod',
        email: 'newmod@circleup.in',
        password: 'Password123!',
        role: 'staff',
      })
    );
  });

  it('ProductsPage hides Add, Edit, Duplicate, and Delete buttons if staff lacks respective permissions', async () => {
    // User with view only
    const viewOnlyStaff: AdminUser = {
      id: '55555555-5555-5555-5555-555555555555',
      name: 'View Only Staff',
      email: 'viewer@circleup.in',
      role: 'staff',
      isActive: true,
      permissions: ['products:view'],
    };

    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: viewOnlyStaff,
      csrfToken: 'test-csrf',
    });
    vi.spyOn(adminApi, 'getProducts').mockResolvedValue({
      data: [
        {
          id: 'p-1',
          serialNumber: 'CU-VIEW-01',
          name: 'Vintage Tee',
          slug: 'vintage-tee-cu-view-01',
          price: 99900,
          stock: 1,
          category: 'tops',
          status: 'AVAILABLE',
          images: [],
          sizes: ['M'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as unknown as Product,
      ],
      meta: { total: 1, page: 1, limit: 100, totalPages: 1, hasNext: false },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products']}>
          <AdminToastProvider>
            <AdminAuthProvider>
              <ProductsPage />
            </AdminAuthProvider>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    // "Add Thrift Piece" should NOT be rendered
    expect(container.textContent).not.toContain('Add Thrift Piece');

    // "Edit product", "Duplicate as draft copy", "Delete permanently" buttons should NOT be present
    expect(container.querySelector('button[title="Edit product"]')).toBeNull();
    expect(container.querySelector('button[title="Duplicate as draft copy"]')).toBeNull();
    expect(container.querySelector('button[title="Delete permanently"]')).toBeNull();
  });
});
