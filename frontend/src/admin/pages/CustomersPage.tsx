import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Search,
  Phone,
  MapPin,
  Award,
  Sparkles,
  Leaf,
  X,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { AdminTableSkeleton } from '../components/AdminSkeleton';
import type { Customer, CustomerTier, Order } from '@circleup/shared';
import { formatPrice } from '@circleup/shared';

const TIER_CONFIG: Record<
  CustomerTier,
  { label: string; bg: string; text: string; border: string }
> = {
  VIP: {
    label: 'VIP Circle',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
  },
  REGULAR: {
    label: 'Regular Member',
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    border: 'border-emerald-300',
  },
  NEW: {
    label: 'New Customer',
    bg: 'bg-orange-50',
    text: 'text-orange-900',
    border: 'border-orange-200',
  },
  COMMUNITY: {
    label: 'Community Pioneer',
    bg: 'bg-purple-50',
    text: 'text-purple-900',
    border: 'border-purple-200',
  },
};

export function CustomersPage() {
  const { showToast } = useAdminToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [listError, setListError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerData, setSelectedCustomerData] = useState<{
    customer: Customer;
    orders: Order[];
    sustainabilityImpact: {
      garmentsSaved: number;
      co2AvoidedKg: number;
      waterSavedLitres: number;
    };
  } | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      setListError('');
      const res = await adminApi.getCustomers({
        page,
        search: debouncedSearch.trim() || undefined,
        tier: tierFilter !== 'all' ? tierFilter : undefined,
      });
      setCustomers(res.customers);
      setCustomerTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Failed to load customers.');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, tierFilter]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleOpenDetail = async (id: string) => {
    setSelectedCustomerId(id);
    setIsDetailLoading(true);
    setSelectedCustomerData(null);
    setDetailError('');
    try {
      const data = await adminApi.getCustomerById(id);
      setSelectedCustomerData(data);
    } catch {
      setDetailError('Failed to load customer details. Please try again.');
      showToast('Failed to load customer details.', 'error');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const totalSpendAll = customers.reduce((acc, c) => acc + c.totalSpendInPaise, 0);
  const vipCount = customers.filter((c) => c.tier === 'VIP').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#1e2a1c]/10 text-[#1e2a1c]">
              <Users className="size-5" />
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1e2a1c] tracking-tight">
              Customer CRM
            </h1>
          </div>
          <p className="text-xs text-[#1e2a1c]/70 mt-1">
            Manage customer relationships, purchase histories, and circular wardrobe impact.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadCustomers()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2a1c]/20 bg-card hover:bg-[#1e2a1c]/5 text-xs font-semibold text-[#1e2a1c] transition-colors"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh CRM</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#1e2a1c]/15 bg-card/90 p-4 shadow-xs">
          <p className="text-[0.68rem] uppercase font-bold tracking-wider text-[#8b5a3e]">Total Customers</p>
          <p className="mt-1 font-serif text-2xl font-bold text-[#1e2a1c]">{customerTotal}</p>
        </div>
        <div className="rounded-2xl border border-[#1e2a1c]/15 bg-card/90 p-4 shadow-xs">
          <p className="text-[0.68rem] uppercase font-bold tracking-wider text-[#8b5a3e]">VIP members on this page</p>
          <p className="mt-1 font-serif text-2xl font-bold text-amber-900">{vipCount}</p>
        </div>
        <div className="rounded-2xl border border-[#1e2a1c]/15 bg-card/90 p-4 shadow-xs">
          <p className="text-[0.68rem] uppercase font-bold tracking-wider text-[#8b5a3e]">Customer spend on this page</p>
          <p className="mt-1 font-serif text-2xl font-bold text-crimson">{formatPrice(totalSpendAll)}</p>
        </div>
        <div className="rounded-2xl border border-[#1e2a1c]/15 bg-card/90 p-4 shadow-xs">
          <p className="text-[0.68rem] uppercase font-bold tracking-wider text-[#8b5a3e]">Circular Garments Rehomed</p>
          <p className="mt-1 font-serif text-2xl font-bold text-[#1e2a1c]">
            {customers.reduce((acc, c) => acc + (c.garmentsSaved || 0), 0)}
          </p>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/80 p-3 rounded-2xl border border-[#1e2a1c]/15">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#1e2a1c]/40" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search customers by name, email, phone, city..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[#1e2a1c]/20 bg-background focus:outline-none focus:ring-1 focus:ring-[#1e2a1c]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="tier-filter" className="text-xs font-semibold text-[#1e2a1c]/70 whitespace-nowrap">
            Tier:
          </label>
          <select
            id="tier-filter"
            value={tierFilter}
            onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
            className="text-xs rounded-xl border border-[#1e2a1c]/20 bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1e2a1c]"
          >
            <option value="all">All Tiers</option>
            <option value="VIP">VIP Circle</option>
            <option value="REGULAR">Regular Member</option>
            <option value="NEW">New Customer</option>
            <option value="COMMUNITY">Community Pioneer</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      {isLoading ? (
        <AdminTableSkeleton />
      ) : listError ? (
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">{listError} <button type="button" onClick={loadCustomers} className="underline">Retry</button></p>
      ) : customers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1e2a1c]/20 p-12 text-center bg-card/40">
          <Users className="size-10 text-[#1e2a1c]/30 mx-auto mb-3" />
          <h3 className="font-serif text-base font-bold text-[#1e2a1c]">No customers found</h3>
          <p className="text-xs text-[#1e2a1c]/60 mt-1 max-w-sm mx-auto">
            Try adjusting your search query or tier filters. Customers who place orders or register will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#1e2a1c]/15 bg-card shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1e2a1c]/10 bg-[#1e2a1c]/5 text-[#1e2a1c]/80 uppercase tracking-wider text-[0.68rem] font-bold">
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">Location</th>
                <th className="py-3.5 px-4 text-center">Orders</th>
                <th className="py-3.5 px-4 text-right">Lifetime Spend</th>
                <th className="py-3.5 px-4 text-center">Tier</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2a1c]/10">
              {customers.map((c) => {
                const tier = TIER_CONFIG[c.tier] || TIER_CONFIG.NEW;
                const initials = c.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <tr
                    key={c.id}
                    className="hover:bg-[#1e2a1c]/[0.02] transition-colors cursor-pointer group"
                    onClick={() => handleOpenDetail(c.id)}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full bg-[#1e2a1c]/10 text-[#1e2a1c] font-bold flex items-center justify-center text-xs shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-[#1e2a1c] group-hover:text-primary transition-colors">
                            {c.name}
                          </p>
                          <p className="text-[0.68rem] text-[#1e2a1c]/60">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[#1e2a1c]/80">
                          <Phone className="size-3 text-[#1e2a1c]/40" />
                          <span>{c.phone || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-[#1e2a1c]/80">
                        <MapPin className="size-3 text-[#1e2a1c]/40 shrink-0" />
                        <span>{c.city ? `${c.city}${c.state ? `, ${c.state}` : ''}` : '—'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-[#1e2a1c]">
                      {c.totalOrders}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-crimson">
                      {formatPrice(c.totalSpendInPaise)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wide border ${tier.bg} ${tier.text} ${tier.border}`}
                      >
                        {tier.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(c.id);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#1e2a1c]/20 hover:border-[#1e2a1c] text-[#1e2a1c] font-semibold text-xs transition-colors"
                      >
                        <span>View</span>
                        <ChevronRight className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer Detail Drawer / Modal */}
      {!listError && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-[#1e2a1c]">
          <span className="font-medium opacity-75">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading || page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-lg border border-[#1e2a1c]/20 bg-white font-semibold hover:bg-[#1e2a1c]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={isLoading || page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-lg border border-[#1e2a1c]/20 bg-white font-semibold hover:bg-[#1e2a1c]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      {selectedCustomerId && (
        <div
          role="dialog"
          aria-label="Customer Profile Details"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedCustomerId(null)}
        >
          <div
            className="w-full max-w-2xl bg-[#fcfbf7] border border-[#1e2a1c]/20 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {isDetailLoading ? (
              <div className="py-12 text-center space-y-2">
                <RefreshCw className="size-6 animate-spin text-[#1e2a1c] mx-auto" />
                <p className="text-xs font-semibold text-[#1e2a1c]">Loading customer profile...</p>
              </div>
            ) : detailError ? (
              <div role="alert" className="py-12 text-center text-xs text-destructive">
                {detailError} <button type="button" onClick={() => void handleOpenDetail(selectedCustomerId)} className="underline">Retry</button>
              </div>
            ) : selectedCustomerData ? (
              <>
                <div className="flex items-start justify-between border-b border-[#1e2a1c]/10 pb-4">
                  <div className="flex items-center gap-3.5">
                    <div className="size-12 rounded-full bg-[#1e2a1c] text-[#f8f4e2] font-serif text-lg font-bold flex items-center justify-center">
                      {selectedCustomerData.customer.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <h2 className="font-serif text-xl font-bold text-[#1e2a1c]">
                        {selectedCustomerData.customer.name}
                      </h2>
                      <p className="text-xs text-[#8b5a3e] font-semibold mt-0.5">
                        {selectedCustomerData.customer.email} • {selectedCustomerData.customer.phone}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomerId(null)}
                    className="p-1.5 rounded-full hover:bg-[#1e2a1c]/10 text-[#1e2a1c]/70 transition-colors"
                    aria-label="Close modal"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                {/* Sustainability Impact Metric Callout */}
                <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-[#1e2a1c]/5 border border-[#1e2a1c]/10 text-center">
                  <div>
                    <div className="inline-flex items-center gap-1 text-[0.65rem] uppercase font-bold text-[#8b5a3e]">
                      <Leaf className="size-3 text-emerald-800" />
                      <span>Garments Rehomed</span>
                    </div>
                    <p className="mt-1 font-serif text-xl font-bold text-[#1e2a1c]">
                      {selectedCustomerData.sustainabilityImpact.garmentsSaved} pieces
                    </p>
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1 text-[0.65rem] uppercase font-bold text-[#8b5a3e]">
                      <Sparkles className="size-3 text-amber-700" />
                      <span>CO2 Avoided</span>
                    </div>
                    <p className="mt-1 font-serif text-xl font-bold text-[#1e2a1c]">
                      {selectedCustomerData.sustainabilityImpact.co2AvoidedKg} kg
                    </p>
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1 text-[0.65rem] uppercase font-bold text-[#8b5a3e]">
                      <Award className="size-3 text-purple-700" />
                      <span>Lifetime Spend</span>
                    </div>
                    <p className="mt-1 font-serif text-xl font-bold text-crimson">
                      {formatPrice(selectedCustomerData.customer.totalSpendInPaise)}
                    </p>
                  </div>
                </div>

                {/* Primary Address */}
                {selectedCustomerData.customer.addressLine && (
                  <div className="space-y-1.5 text-xs text-[#1e2a1c]/80 border-b border-[#1e2a1c]/10 pb-4">
                    <p className="font-bold uppercase tracking-wider text-[0.68rem] text-[#8b5a3e]">
                      Default Delivery Address
                    </p>
                    <p>
                      {selectedCustomerData.customer.addressLine}, {selectedCustomerData.customer.city},{' '}
                      {selectedCustomerData.customer.state} {selectedCustomerData.customer.postalCode}
                    </p>
                  </div>
                )}

                {/* Recent Orders Timeline */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-sm font-bold text-[#1e2a1c]">
                      Order History ({selectedCustomerData.orders.length})
                    </h3>
                  </div>

                  {selectedCustomerData.orders.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-[#1e2a1c]/20 text-center text-xs text-[#1e2a1c]/60">
                      Orders placed online will sync automatically with this customer profile.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {selectedCustomerData.orders.map((o) => (
                        <div
                          key={o.orderNumber}
                          className="flex items-center justify-between p-3 rounded-xl border border-[#1e2a1c]/15 bg-white/70 text-xs"
                        >
                          <div>
                            <span className="font-bold text-[#1e2a1c]">{o.orderNumber}</span>
                            <span className="text-[#1e2a1c]/60 ml-2">
                              {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'Recent'}
                            </span>
                            <p className="text-[0.68rem] text-[#8b5a3e] mt-0.5">
                              {o.items?.length || 1} items • {o.status}
                            </p>
                          </div>
                          <span className="font-bold text-crimson">{formatPrice(o.totalAmount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedCustomerData.customer.notes && (
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-xs text-amber-950 leading-relaxed">
                    <span className="font-bold">Customer Notes: </span>
                    {selectedCustomerData.customer.notes}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomersPage;
