import { Link, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingBag,
  CalendarDays,
  Ticket,
  Settings,
  History,
  UserCheck,
  ExternalLink,
  LogOut,
} from 'lucide-react';

export function AdminSidebar() {
  const { pathname } = useLocation();
  const { user, isOwner, logout } = useAdminAuth();

  const navItems = [
    { label: 'Overview', to: '/admin', icon: LayoutDashboard, exact: true },
    { label: 'Products', to: '/admin/products', icon: Package },
    { label: 'Collections', to: '/admin/collections', icon: Layers },
    { label: 'Orders', to: '/admin/orders', icon: ShoppingBag },
    { label: 'Rentals & Events', to: '/admin/rentals-events', icon: CalendarDays },
    { label: 'Coupons', to: '/admin/coupons', icon: Ticket },
    ...(isOwner
      ? [
          { label: 'Site Settings', to: '/admin/settings', icon: Settings },
          { label: 'Activity Log', to: '/admin/activity', icon: History },
        ]
      : []),
    { label: 'My Account', to: '/admin/account', icon: UserCheck },
  ];

  return (
    <aside
      className="hidden md:flex flex-col w-64 border-r border-[#1e2a1c]/15 bg-[#f8f4e2] text-[#1e2a1c] h-screen sticky top-0 shrink-0 select-none overflow-y-auto"
      aria-label="Admin Navigation"
    >
      {/* Brand Cluster */}
      <div className="p-6 border-b border-[#1e2a1c]/10 flex items-center justify-between">
        <div>
          <span className="font-serif text-2xl font-semibold tracking-tight text-[#1e2a1c] block">CircleUp</span>
          <span className="text-[0.68rem] tracking-widest uppercase font-semibold text-[#8b5a3e] block">
            Admin Workspace
          </span>
        </div>
        <span
          className="px-2 py-0.5 text-[0.65rem] font-bold rounded-full uppercase tracking-wider"
          style={{
            backgroundColor: isOwner ? '#1e2a1c' : '#8b5a3e',
            color: '#f8f4e2',
          }}
        >
          {user?.role || 'staff'}
        </span>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-3 space-y-1" aria-label="Admin Sections">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#1e2a1c] text-[#f8f4e2] shadow-sm font-semibold'
                  : 'text-[#1e2a1c]/80 hover:bg-[#1e2a1c]/8 hover:text-[#1e2a1c]'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-[#1e2a1c]/10 space-y-2">
        <Link
          to="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold rounded-lg text-[#1e2a1c]/70 hover:bg-[#1e2a1c]/5 hover:text-[#1e2a1c] transition-colors"
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="size-3.5" />
            Live Storefront
          </span>
          <span className="text-[0.65rem] text-[#8b5a3e]">↗</span>
        </Link>

        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-lg text-red-700 hover:bg-red-50 transition-colors"
        >
          <LogOut className="size-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

