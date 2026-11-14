import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

interface AdminToastContextValue {
  showToast: (first: string, second?: string) => void;
  removeToast: (id: string) => void;
}

const AdminToastContext = createContext<AdminToastContextValue | undefined>(undefined);

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((first: string, second?: string) => {
    let tone: ToastTone = 'success';
    let message = '';

    if (first === 'success' || first === 'error' || first === 'info') {
      tone = first;
      message = second || '';
    } else {
      message = first;
      if (second === 'success' || second === 'error' || second === 'info') {
        tone = second;
      }
    }

    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, tone, message }]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  return (
    <AdminToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast Notification Container */}
      <div
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 sm:px-0"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2"
            style={{
              backgroundColor:
                toast.tone === 'error'
                  ? 'rgba(185, 28, 28, 0.95)'
                  : toast.tone === 'info'
                    ? 'rgba(30, 42, 28, 0.95)'
                    : 'rgba(30, 42, 28, 0.95)',
              color: '#f8f4e2',
              borderColor: 'rgba(248, 244, 226, 0.2)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {toast.tone === 'error' ? (
                <AlertCircle className="size-5 text-red-200 shrink-0" />
              ) : toast.tone === 'info' ? (
                <Info className="size-5 text-[#c8d3b0] shrink-0" />
              ) : (
                <CheckCircle2 className="size-5 text-[#9fae80] shrink-0" />
              )}
              <span className="text-sm font-medium leading-snug break-words">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              aria-label="Dismiss toast"
            >
              <X className="size-4 opacity-75 hover:opacity-100" />
            </button>
          </div>
        ))}
      </div>
    </AdminToastContext.Provider>
  );
}

export function useAdminToast() {
  const ctx = useContext(AdminToastContext);
  if (!ctx) {
    throw new Error('useAdminToast must be used within AdminToastProvider');
  }
  return ctx;
}
