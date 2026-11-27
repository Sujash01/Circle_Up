import { Link, useLocation } from 'react-router-dom';
import circleUpLogo from '@/assets/circle-up-logo.png';
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
  Users,
  Mail,
  ExternalLink,
  LogOut,
} from 'lucide-react';

export function AdminSidebar() {
  const { pathname } = useLocation();
  const { user, isOwner, hasPermission, logout } = useAdminAuth();

  const allNavItems = [
    { label: 'Overview', to: '/admin/overview', icon: LayoutDashboard, exact: true, permission: 'overview:view' },
    { label: 'Products', to: '/admin/products', icon: Package, permission: 'products:view' },
    { label: 'Collections', to: '/admin/collections', icon: Layers, permission: 'products:view' },
    { label: 'Orders', to: '/admin/orders', icon: ShoppingBag, permission: 'orders:view' },
    { label: 'Customers', to: '/admin/customers', icon: Users, permission: 'customers:view' },
    { label: 'Inquiries', to: '/admin/inquiries', icon: Mail, permission: 'inquiries:view' },
    { label: 'Rentals & Events', to: '/admin/rentals-events', icon: CalendarDays, permission: 'rentals_events:view' },
    { label: 'Coupons', to: '/admin/coupons', icon: Ticket, permission: 'coupons:view' },
    ...(isOwner
      ? [
          { label: 'Team Accounts', to: '/admin/team', icon: Users, permission: 'team:manage' },
        ]
      : []),
    { label: 'Site Settings', to: '/admin/settings', icon: Settings, permission: 'settings:view' },
    { label: 'Activity Log', to: '/admin/activity', icon: History, permission: 'activity:view' },
    { label: 'My Account', to: '/admin/account', icon: UserCheck },
  ];

  const navItems = allNavItems.filter((item) => {
    if (!item.permission) return true;
    if (item.to === '/admin/team') return isOwner;
    return isOwner || hasPermission(item.permission);
  });

  return (
    <aside
      className="hidden md:flex flex-col w-64 border-r border-[#1e2a1c]/15 bg-[#f8f4e2] text-[#1e2a1c] h-screen sticky top-0 shrink-0 select-none overflow-y-auto"
      aria-label="Admin Navigation"
    >
      {/* Brand Cluster */}
      <div className="p-6 border-b border-[#1e2a1c]/10 flex items-center justify-between">
        <Link to="/admin/overview" className="flex items-center gap-2.5">
          <img src={circleUpLogo} alt="CircleUp" className="h-8 w-auto object-contain" />
          <div>
            <span className="font-serif text-xl font-bold tracking-tight text-[#1e2a1c] block leading-none">CircleUp</span>
            <span className="text-[0.62rem] tracking-widest uppercase font-semibold text-[#8b5a3e] block mt-0.5">
              Admin Workspace
            </span>
          </div>
        </Link>
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

