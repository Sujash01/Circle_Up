import { Link, Outlet } from 'react-router-dom';

interface NavItem {
  label: string;
  to: string;
}

function PortalFrameShell({
  portalName,
  navLabel,
  links,
}: {
  portalName: string;
  navLabel: string;
  links: NavItem[];
}) {
  return (
    <div className="min-h-screen w-full frame-layered-bg p-3 sm:p-5">
      <div className="paper-sheet-3d mx-auto max-w-[1440px] rounded-[1.5rem] bg-[#f8f4e2] text-foreground overflow-hidden">
        <header className="border-b-2 border-foreground/15 bg-[#f8f4e2]/95 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="font-body text-xl font-black tracking-tight text-cocoa">
              CircleUp
            </Link>
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider text-primary-foreground">
              {portalName}
            </span>
          </div>
          <nav aria-label={navLabel} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-cocoa">
            {links.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-full px-3 py-1.5 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="p-6 sm:p-10 min-h-[70vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PublicLayout() {
  return (
    <PortalFrameShell
      portalName="Storefront"
      navLabel="Primary Storefront"
      links={[
        { label: 'Home', to: '/' },
        { label: 'New Arrivals', to: '/new-arrivals' },
        { label: 'Rentals', to: '/rentals' },
        { label: 'The Social Circle', to: '/events' },
        { label: '#ThriftCrew', to: '/thrift-crew' },
        { label: 'Cart', to: '/cart' },
        { label: 'Account', to: '/account' },
      ]}
    />
  );
}

export function CustomerLayout() {
  return (
    <PortalFrameShell
      portalName="Customer CRM"
      navLabel="Customer CRM"
      links={[
        { label: 'Storefront', to: '/' },
        { label: 'Profile', to: '/account' },
        { label: 'Addresses', to: '/account/addresses' },
        { label: 'Orders', to: '/account/orders' },
        { label: 'Rentals', to: '/account/rentals' },
        { label: 'Wishlist', to: '/account/wishlist' },
        { label: 'Notifications', to: '/account/notifications' },
      ]}
    />
  );
}

export function AdminLayout() {
  return (
    <PortalFrameShell
      portalName="Owner CRM"
      navLabel="Owner CRM"
      links={[
        { label: 'Dashboard', to: '/admin' },
        { label: 'Products', to: '/admin/products' },
        { label: 'Inventory', to: '/admin/inventory' },
        { label: 'Checkout Requests', to: '/admin/checkout-requests' },
        { label: 'Orders', to: '/admin/orders' },
        { label: 'Rentals', to: '/admin/rentals' },
        { label: 'Community', to: '/admin/community' },
      ]}
    />
  );
}
