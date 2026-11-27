import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Activity, RefreshCw } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminToast } from '../context/AdminToastContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import { AdminTableSkeleton } from '../components/AdminSkeleton';

interface AuditItem {
  id?: string;
  _id?: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  diff?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export default function ActivityLogPage() {
  const { isOwner, hasPermission } = useAdminAuth();
  const canViewActivity = isOwner || hasPermission('activity:view');
  const { showToast } = useAdminToast();
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDiff, setSelectedDiff] = useState<Record<string, unknown> | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getActivity();
      setLogs(data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch audit log';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (canViewActivity) {
      fetchLogs();
    }
  }, [canViewActivity, fetchLogs]);

  if (!canViewActivity) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center text-xs text-destructive">
        <ShieldAlert className="size-8 mx-auto mb-2 text-destructive" />
        <p className="font-bold">Access Restricted</p>
        <p className="mt-1">
          The security activity audit log requires the activity:view permission or Owner role.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-cocoa">Activity Audit Log</h1>
          <p className="text-xs text-cocoa/70">
            Immutable log of administrative operations, catalog changes, and security actions.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-cocoa hover:text-primary transition-colors"
        >
          <RefreshCw className="size-3.5" />
          Refresh Log
        </button>
      </div>

      {loading ? (
        <AdminTableSkeleton rows={8} />
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Activity className="size-10 mx-auto text-cocoa/30 mb-3" />
          <p className="text-sm font-semibold text-cocoa">No recent admin activity</p>
          <p className="text-xs text-cocoa/60 mt-1">Actions performed by staff and owners will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-cocoa font-bold">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Admin Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Entity ID</th>
                <th className="py-3 px-4">IP</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {logs.map((log, idx) => (
                <tr key={log.id || log._id || idx} className="hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 text-cocoa/70 font-mono whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-cocoa">{log.actorEmail}</p>
                    <span className="inline-block mt-0.5 rounded px-1.5 py-0.2 text-[0.65rem] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                      {log.actorRole}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-cocoa">
                    {log.action}
                  </td>
                  <td className="py-3 px-4 text-cocoa/80">{log.entity}</td>
                  <td className="py-3 px-4 font-mono text-[0.7rem] text-cocoa/60 truncate max-w-[120px]">
                    {log.entityId}
                  </td>
                  <td className="py-3 px-4 font-mono text-[0.7rem] text-cocoa/60">
                    {log.ipAddress || '127.0.0.1'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {log.diff ? (
                      <button
                        onClick={() => setSelectedDiff(log.diff || null)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View Diff
                      </button>
                    ) : (
                      <span className="text-cocoa/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Diff Inspector Modal */}
      {selectedDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-base font-bold text-cocoa">Payload / Diff Inspection</h2>
              <button
                onClick={() => setSelectedDiff(null)}
                className="text-cocoa/60 hover:text-cocoa font-bold text-sm"
              >
                ✕
              </button>
            </div>
            <pre className="rounded-lg bg-background p-4 text-[0.75rem] font-mono text-cocoa overflow-x-auto max-h-[60vh] border border-border">
              {JSON.stringify(selectedDiff, null, 2)}
            </pre>
            <div className="flex justify-end">
              <button
                onClick={() => setSelectedDiff(null)}
                className="px-4 py-2 rounded-lg bg-primary text-xs font-bold text-primary-foreground hover:bg-forest-deep transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
