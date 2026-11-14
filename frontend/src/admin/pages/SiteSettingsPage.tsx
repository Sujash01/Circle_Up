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
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import { AdminCardSkeleton } from '../components/AdminSkeleton';
import type { SiteSettings } from '@circleup/shared';

export default function SiteSettingsPage() {
  const { isOwner } = useAdminAuth();
  const { showToast } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    setLoading(true);
    try {
      const data = await adminApi.getSettings();
      setSettings(data || {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch settings';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      showToast('error', 'Only the store Owner can update site settings.');
      return;
    }
    setSaving(true);
    try {
      const updated = await adminApi.updateSettings(settings);
      setSettings(updated);
      showToast('success', 'Site settings saved successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update site settings';
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
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-forest-deep transition-colors disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      </div>

      {loading ? (
        <AdminCardSkeleton count={2} />
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
              value={settings.announcementText || ''}
              onChange={(e) => setSettings({ ...settings, announcementText: e.target.value })}
              placeholder="e.g. Use code THRIFT10 or CIRCLE20 in bag • Plastic-free packaging"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-cocoa focus:border-primary focus:outline-none"
            />
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
                <label className="block font-semibold text-cocoa mb-1">WhatsApp Concierge Number</label>
                <input
                  type="text"
                  value={settings.whatsappNumber || ''}
                  onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-cocoa focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
