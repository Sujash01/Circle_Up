import React, { useCallback, useEffect, useState } from 'react';
import {
  Save,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Bell,
  MessageSquare,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import { AdminCardSkeleton } from '../components/AdminSkeleton';
import { normalizeBusinessWhatsappNumber, siteSettingsUpdateSchema, type SiteSettings } from '@circleup/shared';

export default function SiteSettingsPage() {
  const { isOwner } = useAdminAuth();
  const { showToast } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSettings, setSavedSettings] = useState<SiteSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveFeedback, setSaveFeedback] = useState('');
  const [settings, setSettings] = useState<Partial<SiteSettings>>({
    announcementText: '',
    marqueePhrases: [],
    storeAddress: '',
    contactEmail: '',
    contactPhone: '',
    whatsappNumber: '',
  });
  const [newPhrase, setNewPhrase] = useState('');

  const fetchSettings = useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    setLoadError('');
    setSaveFeedback('');
    try {
      const data = await adminApi.getSettings();
      setSavedSettings(data);
      setSettings(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch settings';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      showToast('error', 'Only the store Owner can update site settings.');
      return;
    }
    if (!savedSettings || loadError) return;
    const patch = Object.fromEntries(Object.entries(settings).filter(([field, value]) =>
      field !== 'updatedAt' && field !== 'contentVersion' &&
      JSON.stringify(value) !== JSON.stringify(savedSettings[field as keyof SiteSettings])));
    if (Object.keys(patch).length === 0) {
      setSaveFeedback('Your settings are up to date.');
      return;
    }
    if (patch.isWhatsappVerified === true) patch.whatsappNumber = settings.whatsappNumber ?? '';
    const parsed = siteSettingsUpdateSchema.safeParse({ ...patch, contentVersion: savedSettings.contentVersion });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Check the settings fields.';
      setSaveFeedback(message);
      showToast('error', message);
      return;
    }
    setSaving(true);
    setSaveFeedback('');
    try {
      const updated = await adminApi.updateSettings(parsed.data);
      setSavedSettings(updated);
      setSettings(updated);
      setSaveFeedback('Site settings saved.');
      showToast('success', 'Site settings saved successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update site settings';
      setSaveFeedback(msg);
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const addPhrase = () => {
    if (!newPhrase.trim()) return;
    setSettings((prev) => ({
      ...prev,
      marqueePhrases: [...(prev.marqueePhrases || []), newPhrase.trim()],
    }));
    setNewPhrase('');
  };

  const removePhrase = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      marqueePhrases: (prev.marqueePhrases || []).filter((_, i) => i !== index),
    }));
  };

  const movePhrase = (index: number, direction: 'up' | 'down') => {
    const list = [...(settings.marqueePhrases || [])];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;
    const temp = list[index];
    const targetItem = list[target];
    if (temp !== undefined && targetItem !== undefined) {
      list[index] = targetItem;
      list[target] = temp;
      setSettings((prev) => ({ ...prev, marqueePhrases: list }));
    }
  };

  if (!isOwner) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center text-xs text-destructive">
        <p className="font-bold">Access Restricted</p>
        <p className="mt-1">
          Site settings can only be viewed and modified by an administrator with the Owner role.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-cocoa">Site Settings</h1>
          <p className="text-xs text-cocoa/70">
            Control the top announcement bar, scrolling ticker marquee, and contact points across
            the site.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchSettings}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-cocoa hover:text-primary transition-colors"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || Boolean(loadError) || !savedSettings}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-forest-deep transition-colors disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      </div>

      {saveFeedback && <p role="status" className="rounded-lg border border-border bg-card p-3 text-sm">{saveFeedback}</p>}
      {loading ? (
        <AdminCardSkeleton count={2} />
      ) : loadError ? (
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">{loadError} <button type="button" onClick={fetchSettings} className="underline">Retry</button></p>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Top Announcement Bar */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <Bell className="size-4 text-primary" />
              <h2 className="text-sm font-bold text-cocoa">Top Announcement Banner</h2>
            </div>
            <p className="text-xs text-cocoa/70">
              The top header ribbon displayed on every page (e.g., promo codes, shipping notices).
            </p>
            <input
              type="text"
              aria-label="Announcement text"
              value={settings.announcementText || ''}
              onChange={(e) => setSettings({ ...settings, announcementText: e.target.value })}
              placeholder="e.g. Use code THRIFT10 or CIRCLE20 in bag • Plastic-free packaging"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
            />
            <label className="block space-y-1 text-xs font-semibold">
              <span>Announcement link</span>
              <input type="text" value={settings.announcementLink || ''} onChange={(e) => setSettings({ ...settings, announcementLink: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={settings.isAnnouncementActive ?? false}
                onChange={(e) => setSettings({ ...settings, isAnnouncementActive: e.target.checked })} />
              Show announcement
            </label>
          </div>

          {/* Scrolling Marquee Phrases */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <MessageSquare className="size-4 text-primary" />
              <h2 className="text-sm font-bold text-cocoa">Homepage Ticker Marquee</h2>
            </div>
            <p className="text-xs text-cocoa/70">
              Continuous rotating brand statements shown across the homepage. Reorder or add new
              phrases.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add a new marquee statement..."
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPhrase();
                  }
                }}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={addPhrase}
                className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="size-4" />
                Add
              </button>
            </div>

            <div className="divide-y divide-border/60 rounded-lg border border-border bg-background overflow-hidden">
              {(settings.marqueePhrases || []).map((phrase, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 text-xs text-cocoa hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[0.7rem] text-cocoa/40 w-5">#{idx + 1}</span>
                    <span className="font-medium truncate">{phrase}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => movePhrase(idx, 'up')}
                      className="p-1 text-cocoa/60 hover:text-cocoa disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === (settings.marqueePhrases?.length || 0) - 1}
                      onClick={() => movePhrase(idx, 'down')}
                      className="p-1 text-cocoa/60 hover:text-cocoa disabled:opacity-30"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhrase(idx)}
                      className="p-1 text-red-600 hover:text-red-700 ml-1"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Featured Drop Link (Header Dropdown Option - CRM Editable) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-sm font-bold text-cocoa">Featured Dropdown Option (CRM Editable Drop)</h2>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-cocoa cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.customDrop?.enabled ?? true}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customDrop: {
                        label: prev.customDrop?.label || 'Winter Archival Drop',
                        to: prev.customDrop?.to || '/thrifted-treasure',
                        badge: prev.customDrop?.badge || 'Featured Drop',
                        description: prev.customDrop?.description || 'Curated one-of-one archive pieces',
                        enabled: e.target.checked,
                      },
                    }))
                  }
                  className="size-4 accent-primary"
                />
                <span>Active in Storefront Dropdown</span>
              </label>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Configure a custom featured drop option displayed prominently in the storefront navigation dropdown. Update the label, badge, destination route, and description at any time without code deployments.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-cocoa mb-1">Drop Label</label>
                <input
                  type="text"
                  value={settings.customDrop?.label ?? 'Winter Archival Drop'}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customDrop: {
                        label: e.target.value,
                        to: prev.customDrop?.to || '/thrifted-treasure',
                        badge: prev.customDrop?.badge || 'Featured Drop',
                        description: prev.customDrop?.description || 'Curated one-of-one archive pieces',
                        enabled: prev.customDrop?.enabled ?? true,
                      },
                    }))
                  }
                  placeholder="e.g. Winter Archival Drop"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Destination Route / URL</label>
                <input
                  type="text"
                  value={settings.customDrop?.to ?? '/thrifted-treasure'}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customDrop: {
                        label: prev.customDrop?.label || 'Winter Archival Drop',
                        to: e.target.value,
                        badge: prev.customDrop?.badge || 'Featured Drop',
                        description: prev.customDrop?.description || 'Curated one-of-one archive pieces',
                        enabled: prev.customDrop?.enabled ?? true,
                      },
                    }))
                  }
                  placeholder="e.g. /thrifted-treasure, /brand-new, /rentals"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Badge Tag</label>
                <input
                  type="text"
                  value={settings.customDrop?.badge ?? 'Featured Drop'}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customDrop: {
                        label: prev.customDrop?.label || 'Winter Archival Drop',
                        to: prev.customDrop?.to || '/thrifted-treasure',
                        badge: e.target.value,
                        description: prev.customDrop?.description || 'Curated one-of-one archive pieces',
                        enabled: prev.customDrop?.enabled ?? true,
                      },
                    }))
                  }
                  placeholder="e.g. Featured Drop, Exclusive, Limited Rail"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Short Description</label>
                <input
                  type="text"
                  value={settings.customDrop?.description ?? 'Curated one-of-one archive pieces'}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customDrop: {
                        label: prev.customDrop?.label || 'Winter Archival Drop',
                        to: prev.customDrop?.to || '/thrifted-treasure',
                        badge: prev.customDrop?.badge || 'Featured Drop',
                        description: e.target.value,
                        enabled: prev.customDrop?.enabled ?? true,
                      },
                    }))
                  }
                  placeholder="e.g. Curated one-of-one archive pieces"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Store & Contact Details */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <MapPin className="size-4 text-primary" />
              <h2 className="text-sm font-bold text-cocoa">Studio & Contact Channels</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-cocoa mb-1">Physical Store Address</label>
                <input
                  type="text"
                  value={settings.storeAddress || ''}
                  onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Customer Support Email</label>
                <input
                  type="email"
                  value={settings.contactEmail || ''}
                  onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-cocoa mb-1">Phone Line</label>
                <input
                  type="text"
                  value={settings.contactPhone || ''}
                  onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="business-whatsapp" className="block font-semibold text-cocoa mb-1">WhatsApp Concierge Number</label>
                <input
                  id="business-whatsapp"
                  type="tel"
                  value={settings.whatsappNumber || ''}
                  onChange={(e) => {
                    const whatsappNumber = e.target.value;
                    setSettings((current) => ({
                      ...current,
                      whatsappNumber,
                      isWhatsappVerified: normalizeBusinessWhatsappNumber(current.whatsappNumber) === normalizeBusinessWhatsappNumber(whatsappNumber)
                        ? current.isWhatsappVerified
                        : false,
                    }));
                  }}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
                <label className="mt-2 flex items-center gap-2 text-cocoa">
                  <input
                    type="checkbox"
                    checked={settings.isWhatsappVerified ?? false}
                    disabled={!normalizeBusinessWhatsappNumber(settings.whatsappNumber)}
                    onChange={(e) => setSettings({ ...settings, isWhatsappVerified: e.target.checked })}
                  />
                  Verified for checkout
                </label>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
