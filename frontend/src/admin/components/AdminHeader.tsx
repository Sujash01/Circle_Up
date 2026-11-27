import { useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { ShieldCheck, User } from 'lucide-react';

const ROUTE_TITLES: Record<string, string> = {
  '/admin': 'Dashboard Overview',
  '/admin/overview': 'Dashboard Overview',
  '/admin/products': 'Product Catalog',
  '/admin/products/new': 'Add New Product',
  '/admin/collections': 'Homepage Tiles & Collections',
  '/admin/orders': 'Customer Orders',
  '/admin/customers': 'Customers CRM',
  '/admin/inquiries': 'Customer Inquiries',
  '/admin/rentals': 'Rentals & Events Editor',
  '/admin/rentals-events': 'Rentals & Events Editor',
  '/admin/coupons': 'Promo Coupons',
  '/admin/team': 'Team Accounts',
  '/admin/settings': 'Site Settings',
  '/admin/activity': 'Audit Activity Log',
  '/admin/account': 'Account & Security',
};

export function AdminHeader() {
  const { pathname } = useLocation();
  const { user } = useAdminAuth();

  const title = ROUTE_TITLES[pathname] || (pathname.includes('/edit') ? 'Edit Product' : 'Admin Panel');

  return (
    <header className="sticky top-0 z-30 bg-[#f8f4e2]/90 backdrop-blur-md border-b border-[#1e2a1c]/10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#1e2a1c] tracking-tight truncate">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e2a1c]/5 border border-[#1e2a1c]/10 text-xs text-[#1e2a1c]">
          <User className="size-3.5 text-[#8b5a3e]" />
          <span className="font-medium truncate max-w-[150px]">{user?.email}</span>
        </div>
        <span className="flex items-center gap-1 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider rounded-full bg-[#1e2a1c] text-[#f8f4e2]">
          <ShieldCheck className="size-3" />
          {user?.role}
        </span>
      </div>
    </header>
  );
}

