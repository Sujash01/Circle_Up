import { useEffect, type ReactNode } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminBottomNav } from './AdminBottomNav';
import { AdminHeader } from './AdminHeader';

export function AdminLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Enforce noindex on all admin pages
    let metaRobots = document.querySelector('meta[name="robots"]');
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.setAttribute('name', 'robots');
      document.head.appendChild(metaRobots);
    }
    const previous = metaRobots.getAttribute('content');
    metaRobots.setAttribute('content', 'noindex, nofollow');

    return () => {
      if (previous) {
        metaRobots?.setAttribute('content', previous);
      } else {
        metaRobots?.remove();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f4e2] text-[#1e2a1c] font-sans flex flex-col md:flex-row antialiased">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-8">
        <AdminHeader />
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto" id="admin-main">
          {children}
        </main>
      </div>
      <AdminBottomNav />
    </div>
  );
}

