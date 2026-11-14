import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  MoreHorizontal,
  Layers,
  CalendarDays,
  Ticket,
  Settings,
  History,
  UserCheck,
  X,
  LogOut,
  ExternalLink,
} from 'lucide-react';

export function AdminBottomNav() {
  const { pathname } = useLocation();
  const { isOwner, logout } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const mainTabs = [
    { label: 'Overview', to: '/admin', icon: LayoutDashboard, exact: true },
    { label: 'Products', to: '/admin/products', icon: Package },
    { label: 'Orders', to: '/admin/orders', icon: ShoppingBag },
  ];

  const moreItems = [
    { label: 'Collections & Tiles', to: '/admin/collections', icon: Layers },
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
    <>
      {/* Mobile Drawer Overlay */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="More navigation options"
          className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex flex-col justify-end animate-in fade-in"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="bg-[#f8f4e2] rounded-t-3xl border-t border-[#1e2a1c]/20 p-6 pb-24 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#1e2a1c]/10">
              <span className="font-serif text-lg font-bold text-[#1e2a1c]">More Admin Tools</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-full hover:bg-[#1e2a1c]/10 text-[#1e2a1c]"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-semibold transition-all min-h-[44px] ${
                      isActive
                        ? 'bg-[#1e2a1c] text-[#f8f4e2]'
                        : 'bg-[#1e2a1c]/5 text-[#1e2a1c] hover:bg-[#1e2a1c]/10'
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[#1e2a1c]/10 flex items-center justify-between">
              <Link
                to="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-[#8b5a3e]"
              >
                <ExternalLink className="size-3.5" />
                Live Storefront
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  logout();
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800"
              >
                <LogOut className="size-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#f8f4e2]/95 backdrop-blur-md border-t border-[#1e2a1c]/15 px-3 py-1 flex items-center justify-around shadow-lg"
        aria-label="Mobile Navigation"
      >
        {mainTabs.map((tab) => {
          const isActive = tab.exact ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center py-1.5 px-3 min-h-[48px] rounded-xl text-[0.7rem] font-semibold transition-colors ${
                isActive ? 'text-[#1e2a1c] font-bold' : 'text-[#1e2a1c]/60 hover:text-[#1e2a1c]'
              }`}
            >
              <Icon className={`size-5 mb-0.5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              <span>{tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center justify-center py-1.5 px-3 min-h-[48px] rounded-xl text-[0.7rem] font-semibold transition-colors ${
            drawerOpen ? 'text-[#1e2a1c] font-bold' : 'text-[#1e2a1c]/60 hover:text-[#1e2a1c]'
          }`}
          aria-expanded={drawerOpen}
          aria-label="Open more tools menu"
        >
          <MoreHorizontal className="size-5 mb-0.5" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

