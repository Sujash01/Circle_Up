import React, { useState } from 'react';
import { User, Lock, LogOut, ShieldCheck, Key } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import { adminApi } from '../services/adminApi';

export default function AccountPage() {
  const { user, logout } = useAdminAuth();
  const { showToast } = useAdminToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      showToast('error', 'Please enter both current and new password');
      return;
    }
    if (newPassword.length < 8) {
      showToast('error', 'New password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('error', 'New passwords do not match');
      return;
    }

    setSaving(true);
    try {
      await adminApi.changePassword({ currentPassword, newPassword });
      showToast('success', 'Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-cocoa">Account & Security</h1>
        <p className="text-xs text-cocoa/70">
          Manage your administrator credentials and session settings.
        </p>
      </div>

      {/* Admin Profile Overview */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <User className="size-4 text-primary" />
          <h2 className="text-sm font-bold text-cocoa">Administrator Profile</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-cocoa">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider text-primary">
                <ShieldCheck className="size-3" />
                Role: {user?.role}
              </span>
              <span className="text-[0.7rem] text-cocoa/60 font-mono">ID: {user?.id}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors"
          >
            <LogOut className="size-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Change Password Form */}
      <form
        onSubmit={handleChangePassword}
        className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <Key className="size-4 text-primary" />
          <h2 className="text-sm font-bold text-cocoa">Change Password</h2>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-cocoa mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-cocoa mb-1">New Password (min 8 chars)</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-cocoa mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-cocoa focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-forest-deep transition-colors disabled:opacity-50"
          >
            <Lock className="size-4" />
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

