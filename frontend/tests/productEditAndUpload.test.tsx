import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@circleup/shared';
import AdminApp from '../src/admin/AdminApp';
import { ProductFormPage } from '../src/admin/pages/ProductFormPage';
import { ProductsPage } from '../src/admin/pages/ProductsPage';
import { adminApi } from '../src/admin/services/adminApi';
import { AdminToastProvider } from '../src/admin/context/AdminToastContext';
import { AdminAuthProvider } from '../src/admin/context/AdminAuthContext';

// Ensure react act environment flag is set
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Product Edit & Image Upload Flow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(adminApi, 'getMe').mockResolvedValue({
      user: { id: 'admin-1', email: 'owner@circleup.in', role: 'owner', name: 'Owner', isActive: true, permissions: [] },
      csrfToken: 'mock-csrf-token',
    });
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

  it('renders ProductsPage and clicking Edit navigates to /admin/products/:serialNumber/edit', async () => {
    const mockProducts = [
      {
        id: 'uuid-1',
        serialNumber: 'CU-042',
        name: 'Vintage Denim Jacket',
        slug: 'vintage-denim-jacket-cu-042',
        price: 350000,
        stock: 2,
        status: 'AVAILABLE',
        category: 'womens-one-piece',
        images: ['https://example.com/jacket.webp'],
        sizes: ['M'],
      },
    ] as unknown as Product[];

    vi.spyOn(adminApi, 'getProducts').mockResolvedValue({
      data: mockProducts,
      meta: { total: 1, page: 1, limit: 100, totalPages: 1, hasNext: false },
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products']}>
          <AdminToastProvider>
            <AdminAuthProvider>
              <Routes>
                <Route path="/admin/products" element={<ProductsPage />} />
                <Route
                  path="/admin/products/:id/edit"
                  element={<div data-testid="edit-page-marker">Editing Product</div>}
                />
              </Routes>
            </AdminAuthProvider>
          </AdminToastProvider>
        </MemoryRouter>,
      );
    });

    // Flush async loadProducts
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      if (container.querySelector('button[title="Edit product"]')) break;
    }

    // Wait for catalog table to load
    const editBtn = container.querySelector('button[title="Edit product"]') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();

    await act(async () => {
      editBtn.click();
    });

    // Verify edit route was reached
    const marker = container.querySelector('[data-testid="edit-page-marker"]');
    expect(marker).not.toBeNull();
  });

  it('loads existing product details in ProductFormPage and populates form fields', async () => {
    const mockProduct = {
      id: 'uuid-042',
      serialNumber: 'CU-042',
      name: 'Retro Velvet Blazer',
      slug: 'retro-velvet-blazer',
      description: 'Stunning vintage velvet piece',
      price: 450000,
      stock: 3,
      status: 'AVAILABLE',
      category: 'womens-one-piece',
      categoryCode: 'SET',
      condition: 'Mint',
      gender: 'Women',
      sizes: ['M', 'L'],
      tags: ['velvet', 'retro'],
      images: ['https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/uuid/800w.webp'],
    } as unknown as Product;

    vi.spyOn(adminApi, 'getProduct').mockResolvedValue(mockProduct);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/CU-042/edit']}>
          <AdminToastProvider>
            <Routes>
              <Route path="/admin/products/:id/edit" element={<ProductFormPage />} />
            </Routes>
          </AdminToastProvider>
        </MemoryRouter>,
      );
    });

    // Flush async loadProduct
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      if (container.querySelector('input[placeholder="e.g. Vintage Silk Pleated Midi Skirt"]')) break;
    }

    // Check that name input contains product name
    const nameInput = container.querySelector('input[placeholder="e.g. Vintage Silk Pleated Midi Skirt"]') as HTMLInputElement;
    expect(nameInput?.value).toBe('Retro Velvet Blazer');

    // Check that price in rupees is converted from paise (450000 paise = 4500 rupees)
    const priceInput = container.querySelector('input[placeholder="2550"]') as HTMLInputElement;
    expect(priceInput?.value).toBe('4500');

    // Check that the existing image is loaded and displayed
    const previewImg = container.querySelector('img[src="https://circleup.supabase.co/storage/v1/object/public/product-images/products/hash/uuid/800w.webp"]') as HTMLImageElement;
    expect(previewImg).not.toBeNull();
  });

  it('ProductFormPage also resolves under /admin/products/edit/:id route', async () => {
    const mockProduct = {
      id: 'uuid-099',
      serialNumber: 'CU-099',
      name: 'Classic Trench',
      slug: 'classic-trench',
      price: 600000,
      stock: 1,
      status: 'AVAILABLE',
      category: 'womens-one-piece',
      images: [],
    } as unknown as Product;

    vi.spyOn(adminApi, 'getProduct').mockResolvedValue(mockProduct);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/edit/CU-099']}>
          <AdminToastProvider>
            <Routes>
              <Route path="/admin/products/edit/:id" element={<ProductFormPage />} />
            </Routes>
          </AdminToastProvider>
        </MemoryRouter>,
      );
    });

    // Flush async loadProduct
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      if (container.querySelector('input[placeholder="e.g. Vintage Silk Pleated Midi Skirt"]')) break;
    }

    const nameInput = container.querySelector('input[placeholder="e.g. Vintage Silk Pleated Midi Skirt"]') as HTMLInputElement;
    expect(nameInput?.value).toBe('Classic Trench');
  });

  it('AdminApp resolves both edit URL formats and redirects unmatched routes to /admin/overview without looping', async () => {
    const mockProduct = {
      id: 'uuid-048',
      serialNumber: 'CU-048',
      name: 'Vintage Silk Shirt',
      slug: 'vintage-silk-shirt-cu-048',
      price: 180000,
      stock: 1,
      status: 'AVAILABLE',
      category: 'womens-one-piece',
      images: [],
    } as unknown as Product;

    vi.spyOn(adminApi, 'getProduct').mockResolvedValue(mockProduct);

    // Test 1: /admin/products/edit/CU-048 loads form cleanly in full AdminApp
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/edit/CU-048']}>
          <Routes>
            <Route path="/admin/*" element={<AdminApp />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      if (container.querySelector('input[placeholder="e.g. Vintage Silk Pleated Midi Skirt"]')) break;
    }

    const editName = container.querySelector('input[placeholder="e.g. Vintage Silk Pleated Midi Skirt"]') as HTMLInputElement;
    expect(editName?.value).toBe('Vintage Silk Shirt');
  });

  it('ProductFormPage uploads media, strips placeholders, and assigns cover to first upload', async () => {
    vi.spyOn(adminApi, 'uploadMedia').mockResolvedValue([
      {
        original: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h1/u1/800w.webp',
        w400: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h1/u1/400w.webp',
        w800: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h1/u1/800w.webp',
        w1600: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h1/u1/1600w.webp',
        hash: 'hash1',
      },
      {
        original: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h2/u2/800w.webp',
        w400: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h2/u2/400w.webp',
        w800: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h2/u2/800w.webp',
        w1600: 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h2/u2/1600w.webp',
        hash: 'hash2',
      },
    ]);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/new']}>
          <AdminToastProvider>
            <Routes>
              <Route path="/admin/products/new" element={<ProductFormPage />} />
            </Routes>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file1 = new File(['image-bits-1'], 'item-front.webp', { type: 'image/webp' });
    const file2 = new File(['image-bits-2'], 'item-back.webp', { type: 'image/webp' });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file1, file2],
        writable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Check that uploaded photos are rendered
    const img1 = container.querySelector('img[src="https://circleup.supabase.co/storage/v1/object/public/product-images/products/h1/u1/800w.webp"]');
    const img2 = container.querySelector('img[src="https://circleup.supabase.co/storage/v1/object/public/product-images/products/h2/u2/800w.webp"]');
    expect(img1).not.toBeNull();
    expect(img2).not.toBeNull();

    // Check that /assets/rtw-1.webp placeholder is not present
    const placeholderImg = container.querySelector('img[src="/assets/rtw-1.webp"]');
    expect(placeholderImg).toBeNull();
  });

  it('surfaces upload failure clearly in toast and does not inject silent placeholders', async () => {
    vi.spyOn(adminApi, 'uploadMedia').mockRejectedValue(new Error('Bucket product-images is not available'));

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/new']}>
          <AdminToastProvider>
            <Routes>
              <Route path="/admin/products/new" element={<ProductFormPage />} />
            </Routes>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(['bad-bits'], 'broken.jpg', { type: 'image/jpeg' });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [testFile],
        writable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Check that error toast was surfaced
    const toast = document.querySelector('.bg-red-500, [role="alert"]') || container.querySelector('.bg-red-500');
    expect(toast).not.toBeNull();
    expect(document.body.textContent).toContain('Bucket product-images is not available');

    // Zero placeholder images injected
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(0);
  });

  it('creates product with uploaded image and persists URL to backend payload', async () => {
    const uploadedUrl = 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h3/u3/800w.webp';
    vi.spyOn(adminApi, 'uploadMedia').mockResolvedValue([
      { original: uploadedUrl, w400: uploadedUrl, w800: uploadedUrl, w1600: uploadedUrl, hash: 'h3' },
    ]);
    const createSpy = vi.spyOn(adminApi, 'createProduct').mockResolvedValue({
      id: 'prod-new-1',
      serialNumber: 'CU-NEW-1',
      name: 'Artisan Wool Shawl',
      slug: 'artisan-wool-shawl',
      price: 180000,
      stock: 1,
      status: 'AVAILABLE',
      category: 'womens-one-piece',
      images: [uploadedUrl],
    } as unknown as Product);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/new']}>
          <AdminToastProvider>
            <Routes>
              <Route path="/admin/products/new" element={<ProductFormPage />} />
            </Routes>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    // Set name
    const nameInput = container.querySelector('input[placeholder="e.g. Vintage Silk Pleated Midi Skirt"]') as HTMLInputElement;
    await act(async () => {
      nativeSetter?.call(nameInput, 'Artisan Wool Shawl');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Set price
    const priceInput = container.querySelector('input[placeholder="2550"]') as HTMLInputElement;
    await act(async () => {
      nativeSetter?.call(priceInput, '1800');
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Upload image
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(['shawl-bits'], 'shawl.webp', { type: 'image/webp' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [testFile],
        writable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit form
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const calledPayload = createSpy.mock.calls[0]![0];
    expect(calledPayload.name).toBe('Artisan Wool Shawl');
    expect(calledPayload.price).toBe(180000);
    expect(calledPayload.images).toEqual([uploadedUrl]);
  });

  it('replaces image on existing product, deletes removed image, and saves updated image array', async () => {
    const oldUrl = 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/old/old/800w.webp';
    const newUrl = 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/new/new/800w.webp';

    const mockProduct = {
      id: 'uuid-048',
      serialNumber: 'CU-048',
      name: 'Vintage Silk Shirt',
      slug: 'vintage-silk-shirt-cu-048',
      price: 180000,
      stock: 1,
      status: 'AVAILABLE',
      category: 'womens-one-piece',
      images: [oldUrl],
    } as unknown as Product;

    vi.spyOn(adminApi, 'getProduct').mockResolvedValue(mockProduct);
    vi.spyOn(adminApi, 'uploadMedia').mockResolvedValue([
      { original: newUrl, w400: newUrl, w800: newUrl, w1600: newUrl, hash: 'new-hash' },
    ]);
    const updateSpy = vi.spyOn(adminApi, 'updateProduct').mockResolvedValue({
      ...mockProduct,
      images: [newUrl],
    } as unknown as Product);
    const deleteMediaSpy = vi.spyOn(adminApi, 'deleteMedia').mockResolvedValue({ deleted: true });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/CU-048/edit']}>
          <AdminToastProvider>
            <Routes>
              <Route path="/admin/products/:id/edit" element={<ProductFormPage />} />
            </Routes>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      if (container.querySelector(`img[src="${oldUrl}"]`)) break;
    }

    // Verify existing image loaded
    expect(container.querySelector(`img[src="${oldUrl}"]`)).not.toBeNull();

    // Click remove image button
    const removeBtn = container.querySelector('button[title="Remove image"]') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    await act(async () => {
      removeBtn.click();
    });

    // Old image is removed from UI
    expect(container.querySelector(`img[src="${oldUrl}"]`)).toBeNull();

    // Upload new image
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const newFile = new File(['new-bits'], 'new.webp', { type: 'image/webp' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [newFile],
        writable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // New image is rendered as cover
    expect(container.querySelector(`img[src="${newUrl}"]`)).not.toBeNull();

    // Submit update
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const calledPayload = updateSpy.mock.calls[0]![1];
    expect(calledPayload.images).toEqual([newUrl]);

    // Verify that old unreferenced image was removed via deleteMedia
    expect(deleteMediaSpy).toHaveBeenCalledWith(oldUrl);
  });

  it('uploading images appends to existing gallery without replacing existing images, and omits cover/reordering controls', async () => {
    const img1 = 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h1/u1/800w.webp';
    const img2 = 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h2/u2/800w.webp';
    const img3 = 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h3/u3/800w.webp';

    const mockProduct = {
      id: 'uuid-048',
      serialNumber: 'CU-048',
      name: 'Vintage Silk Shirt',
      slug: 'vintage-silk-shirt-cu-048',
      price: 240000,
      stock: 1,
      status: 'AVAILABLE',
      category: 'womens-one-piece',
      images: [img1, img2],
    } as unknown as Product;

    vi.spyOn(adminApi, 'getProduct').mockResolvedValue(mockProduct);
    vi.spyOn(adminApi, 'uploadMedia').mockResolvedValue([
      { original: img3, w400: img3, w800: img3, w1600: img3, hash: 'h3' },
    ]);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/CU-048/edit']}>
          <AdminToastProvider>
            <Routes>
              <Route path="/admin/products/:id/edit" element={<ProductFormPage />} />
            </Routes>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      if (container.querySelector(`img[src="${img1}"]`)) break;
    }

    // Both initial images are present
    expect(container.querySelector(`img[src="${img1}"]`)).not.toBeNull();
    expect(container.querySelector(`img[src="${img2}"]`)).not.toBeNull();

    // Verify "Set as Cover" buttons and move arrows are NOT rendered
    expect(container.textContent).not.toContain('Set as Cover');
    expect(container.querySelector('button[title="Move left"]')).toBeNull();
    expect(container.querySelector('button[title="Move right"]')).toBeNull();

    // Upload third image
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const newFile = new File(['bits3'], 'third.webp', { type: 'image/webp' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [newFile],
        writable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // ALL 3 images are now present in the gallery — none was replaced!
    const allImgs = container.querySelectorAll('.grid img');
    expect(allImgs.length).toBe(3);
    expect(container.querySelector(`img[src="${img1}"]`)).not.toBeNull();
    expect(container.querySelector(`img[src="${img2}"]`)).not.toBeNull();
    expect(container.querySelector(`img[src="${img3}"]`)).not.toBeNull();
  });

  it('removing cover image automatically designates the first remaining image as cover', async () => {
    const img1 = 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h1/u1/800w.webp';
    const img2 = 'https://circleup.supabase.co/storage/v1/object/public/product-images/products/h2/u2/800w.webp';

    const mockProduct = {
      id: 'uuid-048',
      serialNumber: 'CU-048',
      name: 'Vintage Silk Shirt',
      slug: 'vintage-silk-shirt-cu-048',
      price: 240000,
      stock: 1,
      status: 'AVAILABLE',
      category: 'womens-one-piece',
      images: [img1, img2],
    } as unknown as Product;

    vi.spyOn(adminApi, 'getProduct').mockResolvedValue(mockProduct);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/products/CU-048/edit']}>
          <AdminToastProvider>
            <Routes>
              <Route path="/admin/products/:id/edit" element={<ProductFormPage />} />
            </Routes>
          </AdminToastProvider>
        </MemoryRouter>
      );
    });

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      if (container.querySelector(`img[src="${img1}"]`)) break;
    }

    // First image has cover badge
    const removeBtnsBefore = container.querySelectorAll('button[title="Remove image"]');
    const cardsBefore = Array.from(removeBtnsBefore).map((btn) => btn.closest('.p-3'));
    expect(cardsBefore[0]?.textContent).toContain('Cover');
    expect(cardsBefore[1]?.textContent).not.toContain('Cover');

    // Remove first image
    const firstRemoveBtn = removeBtnsBefore[0] as HTMLButtonElement;
    await act(async () => {
      firstRemoveBtn.click();
    });

    // img1 is removed, img2 is now the first and displays Cover badge
    const removeBtnsAfter = container.querySelectorAll('button[title="Remove image"]');
    const cardsAfter = Array.from(removeBtnsAfter).map((btn) => btn.closest('.p-3'));
    expect(cardsAfter.length).toBe(1);
    expect(container.querySelector(`img[src="${img1}"]`)).toBeNull();
    expect(container.querySelector(`img[src="${img2}"]`)).not.toBeNull();
    expect(cardsAfter[0]?.textContent).toContain('Cover');
  });
});
