import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Ticket,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  X,
  Search,
  UserCheck,
  History,
  Megaphone,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import {
  formatPrice,
  type AnnouncementUpdate,
  type Coupon,
  type CouponRedemption,
  type Customer,
} from '@circleup/shared';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';

type CouponStatus = 'active' | 'scheduled' | 'expired' | 'exhausted' | 'disabled';
type CouponFilter = 'all' | CouponStatus | 'personal';
type ActiveTab = 'coupons' | 'redemptions' | 'announcement';

function getCouponStatus(coupon: Coupon, now = Date.now()): CouponStatus {
  if (!coupon.isActive) return 'disabled';
  if (coupon.startsAt && Date.parse(coupon.startsAt) > now) return 'scheduled';
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) <= now) return 'expired';
  if (coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) return 'exhausted';
  return 'active';
}

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoOrNull(localValue: string): string | null {
  if (!localValue.trim()) return null;
  const d = new Date(localValue);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const STATUS_BADGE: Record<CouponStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  scheduled: { label: 'Scheduled', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  expired: { label: 'Expired', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  exhausted: { label: 'Exhausted', cls: 'bg-stone-100 text-stone-700 border-stone-200' },
  disabled: { label: 'Disabled', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const GOODWILL_REASONS = [
  'Delayed order compensation',
  'Damaged or imperfect item goodwill',
  'VIP customer appreciation',
  'Support resolution gesture',
];

export default function CouponsPage() {
  const { showToast } = useAdminToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>('coupons');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CouponFilter>('all');
  const [selectedCouponFilterId, setSelectedCouponFilterId] = useState<string | null>(null);

  // Create / Edit Public Coupon Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [formValue, setFormValue] = useState(10); // % or ₹
  const [formMinOrderRupees, setFormMinOrderRupees] = useState(0);
  const [formMaxDiscountRupees, setFormMaxDiscountRupees] = useState('');
  const [formUsageLimit, setFormUsageLimit] = useState('');
  const [formPerCustomerLimit, setFormPerCustomerLimit] = useState('1');
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formShowInHeader, setFormShowInHeader] = useState(false);
  const [formHeaderBannerText, setFormHeaderBannerText] = useState('');

  // Issue Customer Coupon Modal
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [custCode, setCustCode] = useState('');
  const [custType, setCustType] = useState<'PERCENTAGE' | 'FLAT'>('FLAT');
  const [custValue, setCustValue] = useState(250); // ₹ or %
  const [custMinOrderRupees, setCustMinOrderRupees] = useState(0);
  const [custUsageLimit, setCustUsageLimit] = useState(1);
  const [custExpiresAt, setCustExpiresAt] = useState('');
  const [custReason, setCustReason] = useState('Delayed order compensation');
  const [custIsActive, setCustIsActive] = useState(true);
  const [issuingCustomerCoupon, setIssuingCustomerCoupon] = useState(false);

  // Announcement Bar state
  const [announcement, setAnnouncement] = useState<AnnouncementUpdate>({
    announcementText: '',
    announcementLink: '/new-arrivals',
    isAnnouncementActive: true,
    announcementCouponCode: '',
    announcementStartsAt: null,
    announcementEndsAt: null,
  });
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [previewCopied, setPreviewCopied] = useState(false);

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCoupons();
      setCoupons(data);
    } catch {
      showToast('error', 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadRedemptions = useCallback(async (couponId?: string | null) => {
    setRedemptionsLoading(true);
    try {
      const data = await adminApi.getCouponRedemptions(couponId ?? undefined);
      setRedemptions(data);
    } catch {
      showToast('error', 'Failed to load coupon redemption history');
    } finally {
      setRedemptionsLoading(false);
    }
  }, [showToast]);

  const loadAnnouncement = useCallback(async () => {
    setAnnouncementLoading(true);
    try {
      const data = await adminApi.getAnnouncementSettings();
      setAnnouncement(data);
    } catch {
      showToast('error', 'Failed to load announcement bar settings');
    } finally {
      setAnnouncementLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadCoupons();
    void loadRedemptions();
    void loadAnnouncement();
  }, [loadCoupons, loadRedemptions, loadAnnouncement]);

  const searchCustomers = useCallback(async (query: string) => {
    setCustomersLoading(true);
    try {
      const res = await adminApi.getCustomers({ limit: 30, search: query || undefined });
      setCustomers(res.customers || []);
    } catch {
      showToast('error', 'Failed to search customers');
    } finally {
      setCustomersLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!isCustomerModalOpen) return;
    const handle = setTimeout(() => {
      void searchCustomers(customerSearch);
    }, 200);
    return () => clearTimeout(handle);
  }, [isCustomerModalOpen, customerSearch, searchCustomers]);

  const stats = useMemo(() => {
    const now = Date.now();
    const activeCount = coupons.filter((c) => getCouponStatus(c, now) === 'active').length;
    const personalCount = coupons.filter((c) => Boolean(c.assignedCustomerId || c.assignedCustomerEmail)).length;
    const totalRedemptions = redemptions.length;
    const totalDiscountGiven = redemptions.reduce((sum, r) => sum + (r.discountPaise || 0), 0);
    return { activeCount, personalCount, totalRedemptions, totalDiscountGiven };
  }, [coupons, redemptions]);

  const publicAdvertisableCoupons = useMemo(() => {
    const now = Date.now();
    return coupons.filter((c) =>
      getCouponStatus(c, now) === 'active'
      && !c.assignedCustomerId
      && !c.assignedCustomerEmail
      && c.targetTier === 'ALL'
      && c.appliesTo === 'ALL',
    );
  }, [coupons]);

  const filteredCoupons = useMemo(() => {
    const now = Date.now();
    const q = searchQuery.trim().toLowerCase();
    return coupons.filter((c) => {
      const status = getCouponStatus(c, now);
      const isPersonal = Boolean(c.assignedCustomerId || c.assignedCustomerEmail);
      if (statusFilter === 'personal' && !isPersonal) return false;
      if (statusFilter !== 'all' && statusFilter !== 'personal' && status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q)
        || (c.description || '').toLowerCase().includes(q)
        || (c.assignedCustomerEmail || '').toLowerCase().includes(q)
        || (c.issueReason || '').toLowerCase().includes(q)
      );
    });
  }, [coupons, searchQuery, statusFilter]);

  const filteredRedemptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return redemptions.filter((r) => {
      if (!q) return true;
      return (
        r.couponCode.toLowerCase().includes(q)
        || r.orderNumber.toLowerCase().includes(q)
        || (r.customerEmail || '').toLowerCase().includes(q)
        || (r.customerName || '').toLowerCase().includes(q)
      );
    });
  }, [redemptions, searchQuery]);

  const openCreateModal = () => {
    setEditingCoupon(null);
    setFormCode('');
    setFormType('PERCENTAGE');
    setFormValue(10);
    setFormMinOrderRupees(0);
    setFormMaxDiscountRupees('');
    setFormUsageLimit('');
    setFormPerCustomerLimit('1');
    setFormStartsAt('');
    setFormExpiresAt('');
    setFormDescription('');
    setFormIsActive(true);
    setFormShowInHeader(false);
    setFormHeaderBannerText('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: Coupon) => {
    setEditingCoupon(c);
    setFormCode(c.code);
    setFormType(c.discountType);
    setFormValue(c.discountType === 'FLAT' ? Math.round(c.value / 100) : c.value);
    setFormMinOrderRupees(Math.round((c.minOrderAmount || 0) / 100));
    setFormMaxDiscountRupees(c.maxDiscountAmount ? String(Math.round(c.maxDiscountAmount / 100)) : '');
    setFormUsageLimit(c.usageLimit ? String(c.usageLimit) : '');
    setFormPerCustomerLimit(String(c.perCustomerLimit || 1));
    setFormStartsAt(toDatetimeLocalValue(c.startsAt));
    setFormExpiresAt(toDatetimeLocalValue(c.expiresAt));
    setFormDescription(c.description || '');
    setFormIsActive(c.isActive);
    setFormShowInHeader(Boolean(c.showInHeader));
    setFormHeaderBannerText(c.headerBannerText || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = formCode.trim().toUpperCase();
    if (!cleanCode) {
      showToast('error', 'Coupon code is required');
      return;
    }
    if (formType === 'PERCENTAGE' && (formValue < 1 || formValue > 100)) {
      showToast('error', 'Percentage discount must be between 1% and 100%');
      return;
    }
    if (formType === 'FLAT' && formValue < 1) {
      showToast('error', 'Flat discount must be at least ₹1');
      return;
    }

    const payload: Record<string, unknown> = {
      code: cleanCode,
      discountType: formType,
      value: formType === 'FLAT' ? Math.round(formValue * 100) : Math.round(formValue),
      minOrderAmount: Math.max(0, Math.round(formMinOrderRupees * 100)),
      perCustomerLimit: Math.max(1, Number(formPerCustomerLimit) || 1),
      description: formDescription.trim() || undefined,
      isActive: formIsActive,
      showInHeader: formShowInHeader,
      headerBannerText: formHeaderBannerText.trim() || undefined,
    };

    if (formType === 'PERCENTAGE' && formMaxDiscountRupees.trim()) {
      payload.maxDiscountAmount = Math.round(Number(formMaxDiscountRupees) * 100);
    }
    if (formUsageLimit.trim()) {
      payload.usageLimit = Number(formUsageLimit);
    }
    const startsAtIso = toIsoOrNull(formStartsAt);
    const expiresAtIso = toIsoOrNull(formExpiresAt);
    if (startsAtIso) payload.startsAt = startsAtIso;
    else if (editingCoupon) payload.startsAt = null;
    if (expiresAtIso) payload.expiresAt = expiresAtIso;
    else if (editingCoupon) payload.expiresAt = null;

    setSaving(true);
    try {
      if (editingCoupon) {
        await adminApi.updateCoupon(editingCoupon.id, payload);
        showToast('success', 'Coupon updated');
      } else {
        await adminApi.createCoupon(payload);
        showToast('success', 'Coupon created');
      }
      setIsModalOpen(false);
      await loadCoupons();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save coupon';
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: Coupon) => {
    try {
      await adminApi.updateCoupon(c.id, { isActive: !c.isActive });
      showToast('success', `${c.code} ${!c.isActive ? 'enabled' : 'disabled'}`);
      await loadCoupons();
    } catch {
      showToast('error', 'Failed to update coupon status');
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!window.confirm(`Delete coupon "${code}"?`)) return;
    try {
      await adminApi.deleteCoupon(id);
      showToast('success', 'Coupon deleted');
      await loadCoupons();
    } catch {
      showToast('error', 'Failed to delete coupon');
    }
  };

  const handleOpenCustomerCouponModal = () => {
    setSelectedCustomerId('');
    setCustomerSearch('');
    setCustCode('');
    setCustType('FLAT');
    setCustValue(250);
    setCustMinOrderRupees(0);
    setCustUsageLimit(1);
    setCustExpiresAt('');
    setCustReason('Delayed order compensation');
    setCustIsActive(true);
    setIsCustomerModalOpen(true);
  };

  const generateSuggestedCode = () => {
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefix = custType === 'FLAT' ? `SORRY${Math.round(custValue)}` : `CARE${Math.round(custValue)}`;
    setCustCode(`${prefix}-${suffix}`);
  };

  const handleIssueCustomerCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      showToast('error', 'Please select a customer');
      return;
    }
    if (!custReason.trim() || custReason.trim().length < 3) {
      showToast('error', 'Please provide a reason for issuing this coupon');
      return;
    }

    setIssuingCustomerCoupon(true);
    try {
      const created = await adminApi.issueCustomerCoupon({
        customerId: selectedCustomerId,
        code: custCode.trim() ? custCode.trim().toUpperCase() : undefined,
        discountType: custType,
        value: custType === 'FLAT' ? Math.round(custValue * 100) : Math.round(custValue),
        minOrderAmount: Math.max(0, Math.round(custMinOrderRupees * 100)),
        usageLimit: custUsageLimit,
        perCustomerLimit: custUsageLimit,
        expiresAt: toIsoOrNull(custExpiresAt),
        issueReason: custReason.trim(),
        isActive: custIsActive,
      });
      showToast('success', `Issued personal coupon ${created.code}`);
      setIsCustomerModalOpen(false);
      await loadCoupons();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to issue customer coupon';
      showToast('error', msg);
    } finally {
      setIssuingCustomerCoupon(false);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAnnouncement(true);
    try {
      const updated = await adminApi.updateAnnouncementSettings({
        announcementText: announcement.announcementText,
        announcementLink: announcement.announcementLink || '/new-arrivals',
        isAnnouncementActive: announcement.isAnnouncementActive,
        announcementCouponCode: announcement.announcementCouponCode || '',
        announcementStartsAt: announcement.announcementStartsAt || null,
        announcementEndsAt: announcement.announcementEndsAt || null,
      });
      setAnnouncement({
        announcementText: updated.announcementText,
        announcementLink: updated.announcementLink,
        isAnnouncementActive: updated.isAnnouncementActive,
        announcementCouponCode: updated.announcementCouponCode || '',
        announcementStartsAt: updated.announcementStartsAt ?? null,
        announcementEndsAt: updated.announcementEndsAt ?? null,
      });
      showToast('success', 'Storefront announcement bar updated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update announcement bar';
      showToast('error', msg);
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const openCouponRedemptions = (couponId: string) => {
    setSelectedCouponFilterId(couponId);
    setActiveTab('redemptions');
    void loadRedemptions(couponId);
  };

  const clearCouponRedemptionFilter = () => {
    setSelectedCouponFilterId(null);
    void loadRedemptions(null);
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedCouponForFilter = selectedCouponFilterId
    ? coupons.find((c) => c.id === selectedCouponFilterId)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-cocoa">Coupons &amp; Promotions</h1>
          <p className="text-xs text-cocoa/70">
            Manage discount codes, customer compensation coupons, redemption history, and the storefront announcement bar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCustomerCouponModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary transition hover:bg-primary/15"
          >
            <UserCheck className="size-3.5" />
            Issue Customer Coupon
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Create Coupon
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cocoa/60">Active Coupons</p>
          <p className="mt-1 text-2xl font-bold text-cocoa tabular-nums">{stats.activeCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cocoa/60">Customer-Specific</p>
          <p className="mt-1 text-2xl font-bold text-cocoa tabular-nums">{stats.personalCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cocoa/60">Recorded Redemptions</p>
          <p className="mt-1 text-2xl font-bold text-cocoa tabular-nums">{stats.totalRedemptions}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cocoa/60">Total Discounts Given</p>
          <p className="mt-1 text-2xl font-bold text-cocoa tabular-nums">{formatPrice(stats.totalDiscountGiven)}</p>
        </div>
      </div>

      {/* Navigation Tabs + Search */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('coupons')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${activeTab === 'coupons' ? 'bg-primary text-primary-foreground' : 'text-cocoa/75 hover:bg-muted'
              }`}
          >
            <Ticket className="size-3.5" />
            Coupons ({coupons.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('redemptions')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${activeTab === 'redemptions' ? 'bg-primary text-primary-foreground' : 'text-cocoa/75 hover:bg-muted'
              }`}
          >
            <History className="size-3.5" />
            Redemption History ({redemptions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('announcement')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${activeTab === 'announcement' ? 'bg-primary text-primary-foreground' : 'text-cocoa/75 hover:bg-muted'
              }`}
          >
            <Megaphone className="size-3.5" />
            Announcement Bar
          </button>
        </div>

        {activeTab !== 'announcement' && (
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-cocoa/45" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'coupons' ? 'Search code, customer, reason...' : 'Search code, order #, customer...'}
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-cocoa focus:border-primary focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* TAB 1: COUPONS */}
      {activeTab === 'coupons' && (
        <div className="space-y-4">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', 'All'],
                ['active', 'Active'],
                ['personal', 'Customer-Specific'],
                ['scheduled', 'Scheduled'],
                ['expired', 'Expired'],
                ['exhausted', 'Exhausted'],
                ['disabled', 'Disabled'],
              ] as Array<[CouponFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${statusFilter === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-cocoa/75 hover:bg-muted'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex h-60 items-center justify-center rounded-xl border border-border bg-card">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : filteredCoupons.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center shadow-xs">
              <Ticket className="size-10 text-cocoa/25" />
              <p className="mt-3 text-sm font-medium text-cocoa">No matching coupons</p>
              <p className="mt-1 text-xs text-cocoa/60">
                Try clearing your search or filter, or create a new promotional or customer-specific coupon.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-cocoa/65">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Code &amp; Scope</th>
                    <th className="px-4 py-3 font-semibold">Discount</th>
                    <th className="px-4 py-3 font-semibold">Usage</th>
                    <th className="px-4 py-3 font-semibold">Validity</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {filteredCoupons.map((c) => {
                    const status = getCouponStatus(c);
                    const badge = STATUS_BADGE[status];
                    const isPersonal = Boolean(c.assignedCustomerId || c.assignedCustomerEmail);
                    return (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-primary">
                              {c.code}
                            </span>
                            {isPersonal && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                                <UserCheck className="size-2.5" />
                                Personal
                              </span>
                            )}
                            {c.showInHeader && (
                              <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                                Header Banner
                              </span>
                            )}
                          </div>
                          {c.assignedCustomerEmail && (
                            <p className="mt-1 text-[11px] font-medium text-cocoa">
                              For: {c.assignedCustomerEmail}
                            </p>
                          )}
                          {(c.issueReason || c.description) && (
                            <p className="mt-0.5 max-w-xs line-clamp-2 text-[11px] text-cocoa/65">
                              {c.issueReason || c.description}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top tabular-nums">
                          <p className="font-bold text-cocoa">
                            {c.discountType === 'PERCENTAGE' ? `${c.value}% OFF` : `${formatPrice(c.value)} OFF`}
                          </p>
                          {c.minOrderAmount > 0 && (
                            <p className="text-[11px] text-cocoa/60">Min bag: {formatPrice(c.minOrderAmount)}</p>
                          )}
                          {c.maxDiscountAmount && c.discountType === 'PERCENTAGE' && (
                            <p className="text-[11px] text-cocoa/60">Cap: {formatPrice(c.maxDiscountAmount)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top tabular-nums">
                          <p className="font-medium text-cocoa">
                            {c.usageCount} / {c.usageLimit ?? '∞'}
                          </p>
                          <p className="text-[11px] text-cocoa/60">{c.perCustomerLimit} / customer</p>
                        </td>
                        <td className="px-4 py-3 align-top text-[11px] text-cocoa/75">
                          {c.startsAt && (
                            <p>From: {new Date(c.startsAt).toLocaleDateString('en-IN')}</p>
                          )}
                          <p>
                            {c.expiresAt
                              ? `Until: ${new Date(c.expiresAt).toLocaleDateString('en-IN')}`
                              : 'No expiry'}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(c)}
                            title="Click to enable/disable"
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${badge.cls}`}
                          >
                            {badge.label}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openCouponRedemptions(c.id)}
                              title="View redemption history"
                              className="rounded-lg p-1.5 text-cocoa/60 hover:bg-muted hover:text-cocoa"
                            >
                              <History className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(c)}
                              title="Edit coupon"
                              className="rounded-lg p-1.5 text-cocoa/60 hover:bg-muted hover:text-cocoa"
                            >
                              <Edit2 className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(c.id, c.code)}
                              title="Delete coupon"
                              className="rounded-lg p-1.5 text-cocoa/60 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REDEMPTION HISTORY */}
      {activeTab === 'redemptions' && (
        <div className="space-y-3">
          {selectedCouponForFilter && (
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
              <span>
                Showing redemptions for coupon <strong className="font-mono">{selectedCouponForFilter.code}</strong>
              </span>
              <button
                type="button"
                onClick={clearCouponRedemptionFilter}
                className="font-semibold text-primary underline"
              >
                Show all coupons
              </button>
            </div>
          )}

          {redemptionsLoading ? (
            <div className="flex h-56 items-center justify-center rounded-xl border border-border bg-card">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : filteredRedemptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center shadow-xs">
              <History className="size-10 text-cocoa/25" />
              <p className="mt-3 text-sm font-medium text-cocoa">No redemptions recorded yet</p>
              <p className="mt-1 text-xs text-cocoa/60">
                Completed checkouts using promo codes will appear here with customer, order, and discount details.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-cocoa/65">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Redeemed At</th>
                    <th className="px-4 py-3 font-semibold">Coupon</th>
                    <th className="px-4 py-3 font-semibold">Order</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 text-right font-semibold">Discount</th>
                    <th className="px-4 py-3 text-right font-semibold">Order Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {filteredRedemptions.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-cocoa/75">
                        {new Date(r.redeemedAt).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                          {r.couponCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-cocoa">
                        {r.orderNumber}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-cocoa">{r.customerName || 'Guest Customer'}</p>
                        {r.customerEmail && <p className="text-[11px] text-cocoa/60">{r.customerEmail}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums">
                        −{formatPrice(r.discountPaise)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-cocoa tabular-nums">
                        {r.orderTotalPaise !== undefined ? formatPrice(r.orderTotalPaise) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ANNOUNCEMENT BAR MANAGER */}
      {activeTab === 'announcement' && (
        <div className="space-y-5">
          {/* Live Storefront Preview */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-cocoa">Live Storefront Preview</h2>
                <p className="text-xs text-cocoa/65">
                  Preview how the announcement bar appears at the top of every storefront page.
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${announcement.isAnnouncementActive
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-stone-100 text-stone-600 border border-stone-200'
                  }`}
              >
                {announcement.isAnnouncementActive ? 'Visible on storefront' : 'Hidden on storefront'}
              </span>
            </div>

            {announcement.isAnnouncementActive ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex min-h-9 flex-wrap items-center justify-center gap-2 bg-forest px-4 py-2 text-center text-[0.75rem] font-medium tracking-[0.03em] text-forest-foreground">
                  <span>{announcement.announcementText || 'Enter an announcement message below...'}</span>
                  {announcement.announcementCouponCode && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewCopied(true);
                        setTimeout(() => setPreviewCopied(false), 1500);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-cream/15 px-2.5 py-0.5 text-[0.68rem] font-semibold text-cream transition hover:bg-cream/25"
                    >
                      {previewCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {previewCopied ? `Copied ${announcement.announcementCouponCode}` : `Copy ${announcement.announcementCouponCode}`}
                    </button>
                  )}
                  <span className="text-cream/70 underline underline-offset-2">
                    {announcement.announcementLink || '/new-arrivals'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-cocoa/60">
                Announcement bar is currently turned off. Toggle visibility on below to preview and publish.
              </div>
            )}
          </div>

          {/* Announcement Configuration Form */}
          <form onSubmit={handleSaveAnnouncement} className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="text-sm font-bold text-cocoa">Announcement Bar Settings</h2>
                <p className="text-xs text-cocoa/65">
                  Disabled, expired, exhausted, or personal customer coupons cannot be advertised here.
                </p>
              </div>
              {announcementLoading && <Loader2 className="size-4 animate-spin text-primary" />}
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-cocoa">
              <input
                type="checkbox"
                checked={announcement.isAnnouncementActive}
                onChange={(e) => setAnnouncement((prev) => ({ ...prev, isAnnouncementActive: e.target.checked }))}
                className="rounded border-border text-primary"
              />
              Show announcement bar on storefront
            </label>

            <div>
              <label className="block text-xs font-semibold text-cocoa mb-1">Announcement Text</label>
              <input
                type="text"
                maxLength={240}
                value={announcement.announcementText}
                onChange={(e) => setAnnouncement((prev) => ({ ...prev, announcementText: e.target.value }))}
                placeholder="e.g. Festive Archive Drop — Enjoy 15% off with code FESTIVE15"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-cocoa mb-1">Linked Active Coupon (optional)</label>
                <select
                  value={announcement.announcementCouponCode || ''}
                  onChange={(e) => setAnnouncement((prev) => ({ ...prev, announcementCouponCode: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                >
                  <option value="">No linked coupon (plain notice)</option>
                  {publicAdvertisableCoupons.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.discountType === 'PERCENTAGE' ? `${c.value}% off` : `${formatPrice(c.value)} off`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-cocoa mb-1">Target Storefront Path</label>
                <input
                  type="text"
                  value={announcement.announcementLink || ''}
                  onChange={(e) => setAnnouncement((prev) => ({ ...prev, announcementLink: e.target.value }))}
                  placeholder="/new-arrivals"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-cocoa mb-1">Schedule Start (optional)</label>
                <input
                  type="datetime-local"
                  value={toDatetimeLocalValue(announcement.announcementStartsAt)}
                  onChange={(e) => setAnnouncement((prev) => ({ ...prev, announcementStartsAt: toIsoOrNull(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-cocoa mb-1">Schedule End (optional)</label>
                <input
                  type="datetime-local"
                  value={toDatetimeLocalValue(announcement.announcementEndsAt)}
                  onChange={(e) => setAnnouncement((prev) => ({ ...prev, announcementEndsAt: toIsoOrNull(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingAnnouncement}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:opacity-90 disabled:opacity-50"
              >
                {savingAnnouncement && <Loader2 className="size-3.5 animate-spin" />}
                Save Announcement Bar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 1: CREATE / EDIT COUPON */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h2 className="font-serif text-lg font-bold text-cocoa">
                {editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create Promotional Coupon'}
              </h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-cocoa/50 hover:text-cocoa">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Coupon Code</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. THRIFT15"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs uppercase text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Discount Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as 'PERCENTAGE' | 'FLAT')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FLAT">Fixed Amount (₹ INR)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">
                    {formType === 'PERCENTAGE' ? 'Discount (%)' : 'Discount (₹)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={formType === 'PERCENTAGE' ? 100 : undefined}
                    value={formValue}
                    onChange={(e) => setFormValue(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Min Order (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={formMinOrderRupees}
                    onChange={(e) => setFormMinOrderRupees(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Max Cap (₹)</label>
                  <input
                    type="number"
                    min={1}
                    disabled={formType !== 'PERCENTAGE'}
                    value={formMaxDiscountRupees}
                    onChange={(e) => setFormMaxDiscountRupees(e.target.value)}
                    placeholder={formType === 'PERCENTAGE' ? 'Optional' : 'N/A'}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa disabled:opacity-50 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Global Usage Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={formUsageLimit}
                    onChange={(e) => setFormUsageLimit(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Per-Customer Limit</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formPerCustomerLimit}
                    onChange={(e) => setFormPerCustomerLimit(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Starts At (optional)</label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Expires At (optional)</label>
                  <input
                    type="datetime-local"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cocoa mb-1">Internal Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional campaign notes"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-cocoa">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded border-border text-primary"
                  />
                  Coupon is active and redeemable
                </label>

                {!editingCoupon?.assignedCustomerId && !editingCoupon?.assignedCustomerEmail && (
                  <>
                    <label className="flex items-center gap-2 text-xs font-semibold text-cocoa">
                      <input
                        type="checkbox"
                        checked={formShowInHeader}
                        onChange={(e) => setFormShowInHeader(e.target.checked)}
                        className="rounded border-border text-primary"
                      />
                      Highlight in storefront top announcement bar
                    </label>
                    {formShowInHeader && (
                      <input
                        type="text"
                        value={formHeaderBannerText}
                        onChange={(e) => setFormHeaderBannerText(e.target.value)}
                        placeholder="Header banner text (e.g. Use code THRIFT15 for 15% off today!)"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                      />
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-cocoa hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  {editingCoupon ? 'Save Changes' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ISSUE CUSTOMER-SPECIFIC COMPENSATION COUPON */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="font-serif text-lg font-bold text-cocoa">Issue Customer Compensation Coupon</h2>
                <p className="text-[11px] text-cocoa/65">
                  Locked strictly to the selected customer account. Never shown publicly in banners.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="text-cocoa/50 hover:text-cocoa"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleIssueCustomerCoupon} className="mt-4 space-y-4">
              {/* Customer Picker */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-cocoa">Select Customer</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-cocoa/45" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customer by name or email..."
                    className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border/60">
                  {customersLoading ? (
                    <div className="flex items-center justify-center py-4 text-xs text-cocoa/60">
                      <Loader2 className="mr-2 size-3.5 animate-spin" /> Loading customers...
                    </div>
                  ) : customers.length === 0 ? (
                    <p className="p-3 text-center text-xs text-cocoa/60">No matching customers found.</p>
                  ) : (
                    customers.map((cust) => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => setSelectedCustomerId(cust.id)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${selectedCustomerId === cust.id ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50'
                          }`}
                      >
                        <div>
                          <p>{cust.name}</p>
                          <p className="text-[11px] text-cocoa/60">{cust.email}</p>
                        </div>
                        {selectedCustomerId === cust.id && <Check className="size-3.5 text-primary" />}
                      </button>
                    ))
                  )}
                </div>
                {selectedCustomer && (
                  <p className="text-[11px] font-medium text-emerald-700">
                    Selected: {selectedCustomer.name} ({selectedCustomer.email})
                  </p>
                )}
              </div>

              {/* Code & Discount */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-semibold text-cocoa">Coupon Code</label>
                    <button
                      type="button"
                      onClick={generateSuggestedCode}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      <Sparkles className="size-3" /> Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={custCode}
                    onChange={(e) => setCustCode(e.target.value.toUpperCase())}
                    placeholder="Auto-generated if blank"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs uppercase text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Discount Type</label>
                  <select
                    value={custType}
                    onChange={(e) => setCustType(e.target.value as 'PERCENTAGE' | 'FLAT')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  >
                    <option value="FLAT">Fixed Amount (₹ INR)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">
                    {custType === 'FLAT' ? 'Amount (₹)' : 'Discount (%)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={custType === 'PERCENTAGE' ? 100 : undefined}
                    value={custValue}
                    onChange={(e) => setCustValue(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Min Order (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={custMinOrderRupees}
                    onChange={(e) => setCustMinOrderRupees(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cocoa mb-1">Max Uses</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={custUsageLimit}
                    onChange={(e) => setCustUsageLimit(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cocoa mb-1">Expiry Date (optional)</label>
                <input
                  type="datetime-local"
                  value={custExpiresAt}
                  onChange={(e) => setCustExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-cocoa">Reason for Issuing</label>
                <div className="flex flex-wrap gap-1.5">
                  {GOODWILL_REASONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustReason(preset)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${custReason === preset
                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                        : 'border-border bg-background text-cocoa/70 hover:bg-muted'
                        }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  required
                  rows={2}
                  value={custReason}
                  onChange={(e) => setCustReason(e.target.value)}
                  placeholder="Describe why this goodwill coupon is being issued..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-cocoa">
                <input
                  type="checkbox"
                  checked={custIsActive}
                  onChange={(e) => setCustIsActive(e.target.checked)}
                  className="rounded border-border text-primary"
                />
                Activate coupon immediately
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-cocoa hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={issuingCustomerCoupon}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50"
                >
                  {issuingCustomerCoupon && <Loader2 className="size-3.5 animate-spin" />}
                  Issue Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
