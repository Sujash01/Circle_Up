import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { AdminToastProvider } from './context/AdminToastContext';
import { AdminLayout } from './components/AdminLayout';
import { AdminCardSkeleton } from './components/AdminSkeleton';
import { ErrorBoundary } from '@/shared/components/guards/ErrorBoundary';

// Lazy-loaded pages within admin
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ProductFormPage = lazy(() => import('./pages/ProductFormPage'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const RentalsEventsPage = lazy(() => import('./pages/RentalsEventsPage'));
const CouponsPage = lazy(() => import('./pages/CouponsPage'));
const SiteSettingsPage = lazy(() => import('./pages/SiteSettingsPage'));
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const InquiriesPage = lazy(() => import('./pages/InquiriesPage'));
const TeamManagementPage = lazy(() => import('./pages/TeamManagementPage'));

function RequirePermission({
  permission,
  ownerOnly = false,
  children,
}: {
  permission?: string;
  ownerOnly?: boolean;
  children: React.ReactElement;
}) {
  const { isOwner, hasPermission } = useAdminAuth();
  if (ownerOnly && !isOwner) {
    return <Navigate to="/admin/overview" replace />;
  }
  if (permission && !isOwner && !hasPermission(permission)) {
    return <Navigate to="/admin/account" replace />;
  }
  return children;
}

function ProtectedAdminRoutes() {
  const { user, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4">
          <p className="text-center font-display text-sm font-bold text-cocoa">Verifying Admin Session...</p>
          <AdminCardSkeleton count={2} />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <AdminLayout>
      <Suspense
        fallback={
          <div className="p-6 space-y-4">
            <AdminCardSkeleton count={2} />
          </div>
        }
      >
        <Routes>
          <Route index element={<Navigate to="/admin/overview" replace />} />
          <Route path="overview" element={<RequirePermission permission="overview:view"><OverviewPage /></RequirePermission>} />
          <Route path="products" element={<RequirePermission permission="products:view"><ProductsPage /></RequirePermission>} />
          <Route path="products/new" element={<RequirePermission permission="products:create"><ProductFormPage /></RequirePermission>} />
          <Route path="products/:id/edit" element={<RequirePermission permission="products:edit"><ProductFormPage /></RequirePermission>} />
          <Route path="products/edit/:id" element={<RequirePermission permission="products:edit"><ProductFormPage /></RequirePermission>} />
          <Route path="collections" element={<RequirePermission permission="products:view"><CollectionsPage /></RequirePermission>} />
          <Route path="orders" element={<RequirePermission permission="orders:view"><OrdersPage /></RequirePermission>} />
          <Route path="customers" element={<RequirePermission permission="customers:view"><CustomersPage /></RequirePermission>} />
          <Route path="rentals" element={<RequirePermission permission="rentals_events:view"><RentalsEventsPage /></RequirePermission>} />
          <Route path="rentals-events" element={<RequirePermission permission="rentals_events:view"><RentalsEventsPage /></RequirePermission>} />
          <Route path="coupons" element={<RequirePermission permission="coupons:view"><CouponsPage /></RequirePermission>} />
          <Route path="settings" element={<RequirePermission permission="settings:view"><SiteSettingsPage /></RequirePermission>} />
          <Route path="activity" element={<RequirePermission permission="activity:view"><ActivityLogPage /></RequirePermission>} />
          <Route path="team" element={<RequirePermission ownerOnly><TeamManagementPage /></RequirePermission>} />
          <Route path="inquiries" element={<RequirePermission permission="inquiries:view"><InquiriesPage /></RequirePermission>} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/admin/overview" replace />} />
        </Routes>
      </Suspense>
    </AdminLayout>
  );
}

export default function AdminApp() {
  return (
    <ErrorBoundary>
      <AdminToastProvider>
        <AdminAuthProvider>
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center bg-background">
                <span className="font-display text-sm font-bold text-cocoa">Loading CircleUp Admin...</span>
              </div>
            }
          >
            <Routes>
              <Route path="login" element={<AdminLoginPage />} />
              <Route path="*" element={<ProtectedAdminRoutes />} />
            </Routes>
          </Suspense>
        </AdminAuthProvider>
      </AdminToastProvider>
    </ErrorBoundary>
  );
}

