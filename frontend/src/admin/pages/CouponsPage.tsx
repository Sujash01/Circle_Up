import React, { useCallback, useEffect, useState } from 'react';
import { Tag, Plus, Edit2, Trash2, Check, X, RefreshCw } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { AdminTableSkeleton } from '../components/AdminSkeleton';
import type { Coupon } from '@circleup/shared';
import { formatPrice } from '@circleup/shared';

export default function CouponsPage() {
  const { showToast } = useAdminToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCoupons();
      setCoupons(data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch coupons';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleToggleActive = async (coupon: Coupon) => {
    const nextActive = !coupon.isActive;
    // optimistic update
    setCoupons((prev) =>
      prev.map((c) => (c.id === coupon.id ? { ...c, isActive: nextActive } : c)),
    );
    try {
      await adminApi.updateCoupon(coupon.id, { isActive: nextActive });
      showToast(
        'success',
        `Coupon ${coupon.code} ${nextActive ? 'activated' : 'disabled'}`,
      );
    } catch (err: unknown) {
      // rollback
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !nextActive } : c)),
      );
      const msg = err instanceof Error ? err.message : 'Failed to update coupon';
      showToast('error', msg);
    }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon || !editingCoupon.code || editingCoupon.value === undefined) {
      showToast('error', 'Please provide a coupon code and discount value');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Coupon> = {
        code: editingCoupon.code.toUpperCase().trim(),
        discountType: editingCoupon.discountType || 'PERCENTAGE',
        value: Number(editingCoupon.value),
        minOrderAmount: Math.round(Number(editingCoupon.minOrderAmount || 0)),
        maxDiscountAmount: editingCoupon.maxDiscountAmount
          ? Math.round(Number(editingCoupon.maxDiscountAmount))
          : undefined,
        isActive: editingCoupon.isActive !== undefined ? editingCoupon.isActive : true,
      };

      if (editingCoupon.id && editingCoupon.id !== 'new') {
        const updated = await adminApi.updateCoupon(editingCoupon.id, payload);
        showToast('success', `Coupon ${updated.code} updated`);
        setCoupons((prev) => prev.map((c) => (c.id === editingCoupon.id ? updated : c)));
      } else {
        const created = await adminApi.createCoupon(payload);
        showToast('success', `Coupon ${created.code} created`);
        setCoupons((prev) => [created, ...prev]);
      }
      setEditingCoupon(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save coupon';
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this coupon?')) return;
    try {
      await adminApi.deleteCoupon(id);
      showToast('success', 'Coupon deleted');
      setCoupons((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete coupon';
      showToast('error', msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-cocoa">Coupons & Promo Codes</h1>
          <p className="text-xs text-cocoa/70">
            Create and manage promotional discount codes for checkout (e.g. THRIFT10, CIRCLE20).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCoupons}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-cocoa hover:text-primary transition-colors"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
          <button
            onClick={() =>
              setEditingCoupon({
                id: 'new',
                code: '',
                discountType: 'PERCENTAGE',
                value: 10,
                minOrderAmount: 0,
                isActive: true,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-forest-deep transition-colors"
          >
            <Plus className="size-4" />
            New Promo Code
          </button>
        </div>
      </div>

      {loading ? (
        <AdminTableSkeleton rows={4} />
      ) : coupons.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Tag className="size-10 mx-auto text-cocoa/30 mb-3" />
          <p className="text-sm font-semibold text-cocoa">No active promo codes</p>
          <p className="text-xs text-cocoa/60 mt-1">
            Create promotional codes to reward customer orders.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-cocoa font-bold">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Discount</th>
                <th className="py-3 px-4">Min Order</th>
                <th className="py-3 px-4">Max Cap</th>
                <th className="py-3 px-4">Usage</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-cocoa tracking-wider">
                    {coupon.code}
                  </td>
                  <td className="py-3 px-4 font-semibold text-primary">
                    {coupon.discountType === 'PERCENTAGE'
                      ? `${coupon.value}% OFF`
                      : `${formatPrice(coupon.value)} OFF`}
                  </td>
                  <td className="py-3 px-4 text-cocoa/70">
                    {coupon.minOrderAmount ? formatPrice(coupon.minOrderAmount) : 'No Minimum'}
                  </td>
                  <td className="py-3 px-4 text-cocoa/70">
                    {coupon.maxDiscountAmount ? formatPrice(coupon.maxDiscountAmount) : 'No Cap'}
                  </td>
                  <td className="py-3 px-4 text-cocoa/80">
                    {coupon.usageCount || 0}
                    {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ' used'}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleToggleActive(coupon)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold transition-colors ${
                        coupon.isActive
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      {coupon.isActive ? (
                        <>
                          <Check className="size-3" />
                          Active
                        </>
                      ) : (
                        <>
                          <X className="size-3" />
                          Disabled
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button
                      onClick={() => setEditingCoupon(coupon)}
                      title="Edit Coupon"
                      className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-cocoa/70 hover:text-primary hover:border-primary transition-colors"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCoupon(coupon.id)}
                      title="Delete Coupon"
                      className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Coupon Modal */}
      {editingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveCoupon}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg font-bold text-cocoa">
                {editingCoupon.id === 'new' ? 'Create Promo Code' : 'Edit Promo Code'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingCoupon(null)}
                className="text-cocoa/60 hover:text-cocoa font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-cocoa mb-1">Coupon Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CIRCLE20"
                  value={editingCoupon.code || ''}
                  onChange={(e) =>
                    setEditingCoupon({ ...editingCoupon, code: e.target.value.toUpperCase() })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa font-mono font-bold uppercase focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-cocoa mb-1">Discount Type</label>
                  <select
                    value={editingCoupon.discountType || 'PERCENTAGE'}
                    onChange={(e) =>
                      setEditingCoupon({
                        ...editingCoupon,
                        discountType: e.target.value as 'PERCENTAGE' | 'FLAT',
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FLAT">Flat Amount (Paise)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-cocoa mb-1">Discount Value</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editingCoupon.value || 10}
                    onChange={(e) =>
                      setEditingCoupon({
                        ...editingCoupon,
                        value: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-cocoa mb-1">Min Order (Paise)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={editingCoupon.minOrderAmount || 0}
                    onChange={(e) =>
                      setEditingCoupon({
                        ...editingCoupon,
                        minOrderAmount: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-cocoa mb-1">Max Cap (Paise)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Optional"
                    value={editingCoupon.maxDiscountAmount || ''}
                    onChange={(e) =>
                      setEditingCoupon({
                        ...editingCoupon,
                        maxDiscountAmount: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="coupon-active"
                  checked={Boolean(editingCoupon.isActive)}
                  onChange={(e) =>
                    setEditingCoupon({ ...editingCoupon, isActive: e.target.checked })
                  }
                  className="rounded border-border text-primary focus:ring-primary size-4"
                />
                <label htmlFor="coupon-active" className="font-semibold text-cocoa">
                  Active (customers can apply in bag)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingCoupon(null)}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-cocoa hover:bg-muted/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-xs font-bold text-primary-foreground hover:bg-forest-deep disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Promo Code'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
