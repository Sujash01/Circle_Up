import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi } from '../services/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import { AdminTableSkeleton } from '../components/AdminSkeleton';
import {
  formatPrice,
  type Product,
  INVENTORY_STATUSES,
  type InventoryStatusCode,
  extractCategoryCodeFromSerial,
} from '@circleup/shared';
import {
  Plus,
  Search,
  Filter,
  Copy,
  Edit2,
  Trash2,
  RefreshCw,
  Archive,
  Eye,
  CheckSquare,
  Square,
  AlertOctagon,
} from 'lucide-react';

export function ProductsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAdminAuth();
  const { showToast } = useAdminToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Product | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await adminApi.getProducts({
        limit: 100,
        includeArchived: true,
        includeDeleted: true,
      });
      setProducts(res.data);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to load products.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (statusFilter !== 'ALL') {
        const pStatus = (p.status || '').toUpperCase();
        if (statusFilter === 'AVAILABLE') {
          if (pStatus !== 'AVAILABLE' && pStatus !== 'ACTIVE' && pStatus !== 'PUBLISHED') return false;
        } else if (statusFilter === 'SOLD') {
          if (pStatus !== 'SOLD' && pStatus !== 'SOLD_OUT' && p.stock > 0) return false;
        } else if (statusFilter === 'ARCHIVED') {
          if (pStatus !== 'ARCHIVED') return false;
        } else if (statusFilter === 'DRAFT') {
          if (pStatus !== 'DRAFT') return false;
        } else {
          if (pStatus !== statusFilter) return false;
        }
      }
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          p.name.toLowerCase().includes(q) ||
          p.serialNumber.toLowerCase().includes(q) ||
          (p.categoryCode && p.categoryCode.toLowerCase().includes(q)) ||
          (p.subcategory && p.subcategory.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [products, search, statusFilter, categoryFilter]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map((p) => p.serialNumber));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleDuplicate = async (id: string) => {
    try {
      const duplicated = await adminApi.duplicateProduct(id);
      showToast(`Duplicated as draft: ${duplicated.name}`, 'success');
      await loadProducts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to duplicate product.', 'error');
    }
  };

  const handleSoftDelete = async (id: string) => {
    try {
      await adminApi.softDeleteProduct(id);
      showToast(`Product ${id} archived.`, 'info');
      await loadProducts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to archive product.', 'error');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await adminApi.restoreProduct(id);
      showToast(`Product ${id} restored to catalog rail.`, 'success');
      await loadProducts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to restore product.', 'error');
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteTarget) return;
    try {
      const targetId = permanentDeleteTarget.serialNumber;
      await adminApi.permanentDeleteProduct(targetId);
      showToast(`Product ${targetId} permanently deleted.`, 'success');
      setPermanentDeleteTarget(null);
      await loadProducts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Cannot delete product associated with customer orders.', 'error');
    }
  };

  const handleBulkAction = async (action: 'publish' | 'unpublish' | 'archive' | 'delete') => {
    if (selectedIds.length === 0) return;
    try {
      await adminApi.bulkAction(action, selectedIds);
      showToast(`Bulk action "${action}" applied to ${selectedIds.length} items.`, 'success');
      setSelectedIds([]);
      await loadProducts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to execute bulk action.', 'error');
    }
  };

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(set);
  }, [products]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#1e2a1c]">Thrift Catalog</h2>
          <p className="text-xs text-[#1e2a1c]/70">
            {filteredProducts.length} of {products.length} products displayed
          </p>
        </div>
        {hasPermission('products:create') && (
          <Link
            to="/admin/products/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] text-xs font-semibold hover:bg-[#1e2a1c]/90 transition-all shadow-sm"
          >
            <Plus className="size-4" />
            Add Thrift Piece
          </Link>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl border border-[#1e2a1c]/10 bg-white/70 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="size-4 text-[#1e2a1c]/40" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, or subcategory..."
            className="w-full bg-transparent border-none text-xs focus:outline-none text-[#1e2a1c]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="size-3.5 text-[#8b5a3e]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white/80 border border-[#1e2a1c]/15 rounded-xl px-2.5 py-1.5 text-xs text-[#1e2a1c] focus:outline-none font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available (In Stock)</option>
              <option value="SOLD">Sold (Light Green)</option>
              <option value="BOOKED">Booked (Peach / Orange)</option>
              <option value="EXCHANGE_BARTER">Exchange / Barter (Blue)</option>
              <option value="RENT">Rent (Magenta)</option>
              <option value="NEED_ATTENTION">Need Attention (Grey)</option>
              <option value="MISSING">Missing (Red)</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived / Soft-Deleted</option>
            </select>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white/80 border border-[#1e2a1c]/15 rounded-xl px-2.5 py-1.5 text-xs text-[#1e2a1c] focus:outline-none font-medium"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadProducts}
            className="p-1.5 rounded-xl border border-[#1e2a1c]/15 bg-white/80 hover:bg-white text-[#1e2a1c] transition-colors"
            title="Refresh Catalog"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Bulk Action Toolbar (When Items Selected) */}
      {selectedIds.length > 0 && (
        <div className="p-3 px-4 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] flex flex-wrap items-center justify-between gap-3 shadow-md animate-in slide-in-from-top-2">
          <span className="text-xs font-semibold">
            {selectedIds.length} item(s) selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkAction('publish')}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold"
            >
              Publish
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('unpublish')}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold"
            >
              Unpublish
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('archive')}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs opacity-75"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Products Table */}
      {isLoading ? (
        <AdminTableSkeleton rows={6} cols={6} />
      ) : filteredProducts.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-[#1e2a1c]/20 bg-white/50 space-y-3">
          <p className="text-sm font-semibold text-[#1e2a1c]">No thrift products match your filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setCategoryFilter('ALL');
            }}
            className="px-4 py-2 rounded-xl bg-[#1e2a1c]/10 text-xs font-bold text-[#1e2a1c] hover:bg-[#1e2a1c]/20"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="rounded-3xl border border-[#1e2a1c]/10 bg-white/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1e2a1c]/10 bg-[#1e2a1c]/5 text-[#8b5a3e] uppercase font-bold text-[0.68rem] tracking-wider select-none">
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-[#1e2a1c]/70 hover:text-[#1e2a1c]"
                      aria-label="Select all products"
                    >
                      {selectedIds.length === filteredProducts.length && filteredProducts.length > 0 ? (
                        <CheckSquare className="size-4 text-[#1e2a1c]" />
                      ) : (
                        <Square className="size-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">Item</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3 text-right">Price</th>
                  <th className="py-3 px-3 text-center">Stock</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2a1c]/5">
                {filteredProducts.map((p) => {
                  const isSelected = selectedIds.includes(p.serialNumber);
                  const isArchived = p.status === 'ARCHIVED';
                  const catCode = p.categoryCode || extractCategoryCodeFromSerial(p.serialNumber);
                  const rawStatus = (p.status || '').toUpperCase() as InventoryStatusCode;
                  const statusMeta = INVENTORY_STATUSES[rawStatus];

                  return (
                    <tr
                      key={p.serialNumber}
                      className={`hover:bg-[#1e2a1c]/5 transition-colors ${isSelected ? 'bg-[#1e2a1c]/8' : ''}`}
                    >
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(p.serialNumber)}
                          className="text-[#1e2a1c]/70 hover:text-[#1e2a1c]"
                          aria-label={`Select ${p.name}`}
                        >
                          {isSelected ? (
                            <CheckSquare className="size-4 text-[#1e2a1c]" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.images[0] || '/assets/rtw-1.webp'}
                            alt={p.name}
                            className="size-11 rounded-xl object-cover bg-stone-100 border border-[#1e2a1c]/10 shrink-0"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <span className="font-semibold text-[#1e2a1c] block truncate max-w-[200px] sm:max-w-xs">
                              {p.name}
                            </span>
                            <div className="flex items-center gap-1.5 pt-0.5">
                              {catCode && (
                                <span className="font-mono text-[0.62rem] font-bold px-1 py-0.2 bg-[#1e2a1c]/10 text-[#1e2a1c] rounded">
                                  {catCode}
                                </span>
                              )}
                              <span className="font-mono text-[0.65rem] text-[#8b5a3e] font-bold">
                                {p.serialNumber}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-[#1e2a1c]/80">
                        <span className="block font-medium">{p.categoryLabel || p.category}</span>
                        {p.subcategory && (
                          <span className="text-[0.68rem] text-[#8b5a3e]">{p.subcategory}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-semibold tabular-nums text-[#1e2a1c]">
                        {formatPrice(p.price)}
                      </td>

                      <td className="py-3 px-3 text-center font-bold">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[0.68rem] ${
                            p.stock === 0
                              ? 'bg-red-100 text-red-800'
                              : p.stock <= 2
                                ? 'bg-amber-100 text-amber-800'
                                : 'text-[#1e2a1c]'
                          }`}
                        >
                          {p.stock}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        {statusMeta ? (
                          <span
                            style={{
                              backgroundColor: statusMeta.bgColor,
                              color: statusMeta.textColor,
                              borderColor: statusMeta.borderColor,
                            }}
                            className="inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider border shadow-2xs"
                          >
                            {statusMeta.badgeText}
                          </span>
                        ) : (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                              isArchived
                                ? 'bg-stone-200 text-stone-700'
                                : p.status === 'PUBLISHED' || p.status === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : p.status === 'SOLD_OUT'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {p.status}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/product/${p.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-[#1e2a1c]/10 text-[#1e2a1c]/70 hover:text-[#1e2a1c] transition-colors"
                            title="View on public site"
                          >
                            <Eye className="size-3.5" />
                          </Link>

                          {hasPermission('products:edit') && (
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/products/${p.serialNumber}/edit`)}
                              className="p-1.5 rounded-lg hover:bg-[#1e2a1c]/10 text-[#1e2a1c]/70 hover:text-[#1e2a1c] transition-colors"
                              title="Edit product"
                            >
                              <Edit2 className="size-3.5" />
                            </button>
                          )}

                          {hasPermission('products:copy') && (
                            <button
                              type="button"
                              onClick={() => handleDuplicate(p.serialNumber)}
                              className="p-1.5 rounded-lg hover:bg-[#1e2a1c]/10 text-[#1e2a1c]/70 hover:text-[#1e2a1c] transition-colors"
                              title="Duplicate as draft copy"
                            >
                              <Copy className="size-3.5" />
                            </button>
                          )}

                          {hasPermission('products:archive') && (
                            isArchived ? (
                              <button
                                type="button"
                                onClick={() => handleRestore(p.serialNumber)}
                                className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-800 transition-colors"
                                title="Restore to catalog"
                              >
                                <RefreshCw className="size-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSoftDelete(p.serialNumber)}
                                className="p-1.5 rounded-lg hover:bg-stone-200 text-stone-700 transition-colors"
                                title="Archive / Soft Delete"
                              >
                                <Archive className="size-3.5" />
                              </button>
                            )
                          )}

                          {hasPermission('products:delete') && (
                            <button
                              type="button"
                              onClick={() => setPermanentDeleteTarget(p)}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-700 transition-colors"
                              title="Delete permanently"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Permanent Deletion */}
      {permanentDeleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPermanentDeleteTarget(null)}
        >
          <div
            className="bg-[#fcfbf7] border border-[#1e2a1c]/20 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-700">
              <div className="size-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertOctagon className="size-6 text-red-700" />
              </div>
              <h3 className="font-serif text-lg font-bold">Delete Permanently?</h3>
            </div>
            <p className="text-xs text-[#1e2a1c]/80 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong>{permanentDeleteTarget.name} ({permanentDeleteTarget.serialNumber})</strong>?
              This action cannot be undone. Permanent deletion is blocked if this product is part of any customer order history.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPermanentDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#1e2a1c]/20 text-xs font-semibold hover:bg-[#1e2a1c]/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePermanentDelete}
                className="px-4 py-2 rounded-xl bg-red-700 text-white text-xs font-semibold hover:bg-red-800"
              >
                Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductsPage;
