import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Edit2,
  Trash2,
  Check,
  X,
  KeyRound,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import { AdminTableSkeleton } from '../components/AdminSkeleton';
import type { AdminUser, GranularAdminPermission } from '@circleup/shared';
import { ALL_ADMIN_PERMISSIONS, ADMIN_PERMISSION_DEFINITIONS } from '@circleup/shared';

const PERMISSION_GROUPS: { group: string; permissions: GranularAdminPermission[] }[] = [
  {
    group: 'Dashboard',
    permissions: ['overview:view'],
  },
  {
    group: 'Products & Catalog',
    permissions: [
      'products:view',
      'products:create',
      'products:edit',
      'products:archive',
      'products:copy',
      'products:delete',
    ],
  },
  {
    group: 'Orders & Fulfillment',
    permissions: ['orders:view', 'orders:manage'],
  },
  {
    group: 'Customers & CRM',
    permissions: ['customers:view', 'customers:manage'],
  },
  {
    group: 'Coupons & Discounts',
    permissions: ['coupons:view', 'coupons:manage'],
  },
  {
    group: 'Rentals & Events',
    permissions: ['rentals_events:view', 'rentals_events:manage'],
  },
  {
    group: 'Inquiries & Inbox',
    permissions: ['inquiries:view', 'inquiries:manage'],
  },
  {
    group: 'Site Settings & Audit',
    permissions: ['settings:view', 'settings:manage', 'activity:view'],
  },
];

interface FormState {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: 'owner' | 'staff';
  isActive: boolean;
  permissions: string[];
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  password: '',
  role: 'staff',
  isActive: true,
  permissions: ['overview:view', 'products:view', 'orders:view'],
};

export default function TeamManagementPage() {
  const { user: currentAdmin, isOwner } = useAdminAuth();
  const { showToast } = useAdminToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAdminUsers();
      setUsers(data || []);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to fetch team members.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenCreate = () => {
    setFormData({
      ...EMPTY_FORM,
      permissions: ['overview:view', 'products:view', 'orders:view'],
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (user: AdminUser) => {
    setFormData({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      isActive: user.isActive,
      permissions: Array.isArray(user.permissions) ? [...user.permissions] : [],
    });
    setModalOpen(true);
  };

  const togglePermission = (perm: string) => {
    setFormData((prev) => {
      const exists = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  const handleSelectAllPermissions = () => {
    setFormData((prev) => ({
      ...prev,
      permissions: [...ALL_ADMIN_PERMISSIONS],
    }));
  };

  const handleClearAllPermissions = () => {
    setFormData((prev) => ({
      ...prev,
      permissions: [],
    }));
  };

  const handlePresetReadOnly = () => {
    setFormData((prev) => ({
      ...prev,
      permissions: [
        'overview:view',
        'products:view',
        'orders:view',
        'customers:view',
        'coupons:view',
        'rentals_events:view',
        'inquiries:view',
      ],
    }));
  };

  const handlePresetCatalogManager = () => {
    setFormData((prev) => ({
      ...prev,
      permissions: [
        'overview:view',
        'products:view',
        'products:create',
        'products:edit',
        'products:archive',
        'products:copy',
      ],
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      showToast('Name and email are required.', 'error');
      return;
    }

    if (!formData.id && (!formData.password || formData.password.length < 8)) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }

    if (formData.password && formData.password.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (formData.id) {
        // Edit existing user
        const patch: Parameters<typeof adminApi.updateAdminUser>[1] = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          role: formData.role,
          isActive: formData.isActive,
          permissions: formData.role === 'owner' ? [] : formData.permissions,
        };
        if (formData.password.trim()) {
          patch.password = formData.password.trim();
        }

        const updated = await adminApi.updateAdminUser(formData.id, patch);
        setUsers((prev) => prev.map((u) => (u.id === formData.id ? updated : u)));
        showToast(`Team member "${updated.name}" updated successfully.`, 'success');
      } else {
        // Create new user
        const payload = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password.trim(),
          role: formData.role,
          permissions: formData.role === 'owner' ? [] : formData.permissions,
        };
        const created = await adminApi.createAdminUser(payload);
        setUsers((prev) => [created, ...prev]);
        showToast(`Team member "${created.name}" created successfully.`, 'success');
      }
      setModalOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save team member.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    if (user.id === currentAdmin?.id) {
      showToast('You cannot deactivate your own account.', 'error');
      return;
    }
    const nextActive = !user.isActive;
    try {
      const updated = await adminApi.updateAdminUser(user.id, { isActive: nextActive });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      showToast(
        `Account "${user.name}" ${nextActive ? 'activated' : 'deactivated'}. Active sessions revoked.`,
        'success',
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to toggle account status.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.deleteAdminUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      showToast(`Team member "${deleteTarget.name}" deleted successfully.`, 'success');
      setDeleteTarget(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to delete team member.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="p-8 text-center rounded-3xl border border-[#1e2a1c]/20 bg-white/60 space-y-3">
        <ShieldAlert className="size-10 text-[#8b5a3e] mx-auto" />
        <h2 className="font-serif text-lg font-bold text-[#1e2a1c]">Owner Access Required</h2>
        <p className="text-xs text-[#1e2a1c]/70 max-w-sm mx-auto">
          Team accounts and permission management are restricted exclusively to the store owner.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#1e2a1c]">
              Team Accounts & Access Control
            </h2>
            <span className="px-2 py-0.5 text-[0.65rem] font-bold rounded-full bg-[#1e2a1c] text-[#f8f4e2] uppercase tracking-wider">
              Owner Only
            </span>
          </div>
          <p className="text-xs text-[#1e2a1c]/70 mt-0.5">
            Create team member accounts, assign credentials, and configure granular module permissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchUsers}
            className="p-2 rounded-xl border border-[#1e2a1c]/15 bg-white/80 hover:bg-white text-[#1e2a1c] transition-colors"
            title="Refresh Team List"
          >
            <RefreshCw className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] text-xs font-semibold hover:bg-[#1e2a1c]/90 transition-all shadow-sm"
          >
            <UserPlus className="size-4" />
            Add Team Member
          </button>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <AdminTableSkeleton rows={4} cols={5} />
      ) : users.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-[#1e2a1c]/20 bg-white/50 space-y-3">
          <Users className="size-8 text-[#8b5a3e] mx-auto opacity-60" />
          <p className="text-sm font-semibold text-[#1e2a1c]">No team accounts found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#1e2a1c]/15 bg-white/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1e2a1c]/10 bg-[#1e2a1c]/5 text-[#1e2a1c]/70 font-semibold uppercase tracking-wider text-[0.68rem]">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Assigned Permissions</th>
                  <th className="py-3 px-3">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2a1c]/5">
                {users.map((member) => {
                  const isSelf = member.id === currentAdmin?.id;
                  const isMemberOwner = member.role === 'owner';
                  const permsCount = isMemberOwner ? ALL_ADMIN_PERMISSIONS.length : (member.permissions?.length || 0);

                  return (
                    <tr
                      key={member.id}
                      className={`hover:bg-[#1e2a1c]/3 transition-colors ${!member.isActive ? 'opacity-60 bg-stone-100/50' : ''}`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-[#1e2a1c]/10 text-[#1e2a1c] flex items-center justify-center font-bold text-xs uppercase">
                            {member.name.charAt(0) || 'U'}
                          </div>
                          <div>
                            <span className="font-semibold text-xs text-[#1e2a1c] block">
                              {member.name} {isSelf && <span className="text-[0.62rem] text-[#8b5a3e] font-normal">(You)</span>}
                            </span>
                            <span className="text-[0.68rem] text-[#1e2a1c]/60 font-mono">
                              {member.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                            isMemberOwner
                              ? 'bg-[#1e2a1c] text-[#f8f4e2]'
                              : 'bg-[#8b5a3e]/15 text-[#8b5a3e]'
                          }`}
                        >
                          {isMemberOwner ? <ShieldCheck className="size-3" /> : <Shield className="size-3" />}
                          {member.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                            member.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {member.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        {isMemberOwner ? (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-stone-200/70 text-stone-800 text-[0.65rem] font-semibold">
                            Full Access (Owner)
                          </span>
                        ) : permsCount === 0 ? (
                          <span className="text-[0.65rem] text-red-600 font-semibold">
                            No permissions assigned
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[0.65rem] font-semibold">
                              {permsCount} of {ALL_ADMIN_PERMISSIONS.length} permissions
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-[0.68rem] text-[#1e2a1c]/70 font-mono">
                        {member.lastLoginAt
                          ? new Date(member.lastLoginAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : 'Never'}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(member)}
                            className="p-1.5 rounded-lg hover:bg-[#1e2a1c]/10 text-[#1e2a1c]/80 hover:text-[#1e2a1c] transition-colors"
                            title="Edit account & permissions"
                          >
                            <Edit2 className="size-3.5" />
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(member)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                member.isActive
                                  ? 'hover:bg-amber-100 text-amber-700'
                                  : 'hover:bg-emerald-100 text-emerald-700'
                              }`}
                              title={member.isActive ? 'Deactivate account' : 'Activate account'}
                            >
                              {member.isActive ? <Lock className="size-3.5" /> : <Check className="size-3.5" />}
                            </button>
                          )}

                          {!isSelf && !isMemberOwner && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(member)}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-700 transition-colors"
                              title="Delete member"
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

      {/* Add / Edit Member Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-[#fcfbf7] border border-[#1e2a1c]/20 rounded-3xl max-w-2xl w-full p-6 shadow-2xl my-8 space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1e2a1c]/10">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1e2a1c]">
                  {formData.id ? 'Edit Team Member & Access' : 'Create New Team Member'}
                </h3>
                <p className="text-xs text-[#1e2a1c]/70">
                  Configure login credentials and granular permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-[#1e2a1c]/10 text-[#1e2a1c]"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-5">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1e2a1c] mb-1">
                    Full Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Priyanshi Sharma"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#1e2a1c]/20 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e2a1c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1e2a1c] mb-1">
                    Email Address <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="name@circleup.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#1e2a1c]/20 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e2a1c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1e2a1c] mb-1">
                    {formData.id ? 'Reset Password (optional)' : 'Password (min 8 chars) *'}
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 size-3.5 text-[#1e2a1c]/40" />
                    <input
                      type="password"
                      required={!formData.id}
                      minLength={8}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={formData.id ? 'Leave blank to keep unchanged' : 'Secure password'}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#1e2a1c]/20 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e2a1c]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1e2a1c] mb-1">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as 'owner' | 'staff' })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#1e2a1c]/20 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e2a1c]"
                  >
                    <option value="staff">Staff (Custom Permissions)</option>
                    <option value="owner">Owner (Full Store Access)</option>
                  </select>
                </div>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1e2a1c]/5 border border-[#1e2a1c]/10">
                <input
                  type="checkbox"
                  id="user-active-toggle"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="size-4 rounded text-[#1e2a1c] focus:ring-[#1e2a1c]"
                />
                <label htmlFor="user-active-toggle" className="text-xs font-semibold text-[#1e2a1c] cursor-pointer">
                  Account is Active
                  <span className="block text-[0.68rem] text-[#1e2a1c]/60 font-normal">
                    When unchecked, this account cannot log in and any active sessions are revoked immediately.
                  </span>
                </label>
              </div>

              {/* Granular Permissions Section */}
              {formData.role === 'staff' ? (
                <div className="space-y-4 pt-2 border-t border-[#1e2a1c]/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-serif text-sm font-bold text-[#1e2a1c]">
                        Granular Permissions ({formData.permissions.length} selected)
                      </h4>
                      <p className="text-[0.68rem] text-[#1e2a1c]/60">
                        Check the modules and actions this team member is authorized to access.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleSelectAllPermissions}
                        className="px-2 py-1 text-[0.65rem] font-semibold rounded-lg bg-[#1e2a1c]/10 hover:bg-[#1e2a1c]/20 text-[#1e2a1c]"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllPermissions}
                        className="px-2 py-1 text-[0.65rem] font-semibold rounded-lg bg-[#1e2a1c]/10 hover:bg-[#1e2a1c]/20 text-[#1e2a1c]"
                      >
                        Clear All
                      </button>
                      <button
                        type="button"
                        onClick={handlePresetReadOnly}
                        className="px-2 py-1 text-[0.65rem] font-semibold rounded-lg bg-[#8b5a3e]/15 hover:bg-[#8b5a3e]/25 text-[#8b5a3e]"
                      >
                        Read-Only
                      </button>
                      <button
                        type="button"
                        onClick={handlePresetCatalogManager}
                        className="px-2 py-1 text-[0.65rem] font-semibold rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
                      >
                        Catalog Manager
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {PERMISSION_GROUPS.map((group) => (
                      <div
                        key={group.group}
                        className="p-3 rounded-xl border border-[#1e2a1c]/10 bg-white/80 space-y-2"
                      >
                        <h5 className="font-semibold text-xs text-[#1e2a1c] border-b border-[#1e2a1c]/5 pb-1">
                          {group.group}
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.permissions.map((perm) => {
                            const def = ADMIN_PERMISSION_DEFINITIONS[perm];
                            const isChecked = formData.permissions.includes(perm);
                            return (
                              <label
                                key={perm}
                                className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer border transition-all ${
                                  isChecked
                                    ? 'bg-[#1e2a1c]/5 border-[#1e2a1c]/30 text-[#1e2a1c]'
                                    : 'bg-transparent border-transparent hover:bg-[#1e2a1c]/3 text-[#1e2a1c]/70'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm)}
                                  className="mt-0.5 size-3.5 rounded text-[#1e2a1c] focus:ring-[#1e2a1c]"
                                />
                                <div>
                                  <span className="block text-xs font-semibold leading-tight">
                                    {def?.label || perm}
                                  </span>
                                  <span className="block text-[0.65rem] text-[#1e2a1c]/60 leading-normal">
                                    {def?.description || perm}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#1e2a1c]/5 border border-[#1e2a1c]/10 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1e2a1c]">
                    <ShieldCheck className="size-4" />
                    Owner Role Selected
                  </div>
                  <p className="text-[0.68rem] text-[#1e2a1c]/70 leading-normal">
                    Owner accounts possess unrestricted permissions across all catalog, orders, financial reconciliation, refunds, and team management modules.
                  </p>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1e2a1c]/10">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#1e2a1c]/15 text-xs font-semibold text-[#1e2a1c] hover:bg-[#1e2a1c]/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#1e2a1c] text-[#f8f4e2] text-xs font-bold hover:bg-[#1e2a1c]/90 disabled:opacity-50 shadow-sm"
                >
                  {saving ? 'Saving...' : formData.id ? 'Save Changes' : 'Create Team Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Member Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-[#fcfbf7] border border-[#1e2a1c]/20 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-700">
              <div className="size-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="size-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-[#1e2a1c]">Delete Team Member</h3>
                <p className="text-xs text-[#1e2a1c]/70">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-[#1e2a1c]/80 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-[#1e2a1c]">{deleteTarget.name}</strong> ({deleteTarget.email})?
              All active sessions for this account will be revoked immediately.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#1e2a1c]/15 text-xs font-semibold text-[#1e2a1c] hover:bg-[#1e2a1c]/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
