import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { AdminToastProvider } from './context/AdminToastContext';
import { AdminLayout } from './components/AdminLayout';
import { AdminCardSkeleton } from './components/AdminSkeleton';

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
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/:id/edit" element={<ProductFormPage />} />
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="rentals" element={<RentalsEventsPage />} />
          <Route path="coupons" element={<CouponsPage />} />
          <Route path="settings" element={<SiteSettingsPage />} />
          <Route path="activity" element={<ActivityLogPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Routes>
      </Suspense>
    </AdminLayout>
  );
}

export default function AdminApp() {
  return (
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
  );
}

