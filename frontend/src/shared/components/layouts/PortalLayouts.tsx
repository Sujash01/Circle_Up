import { Link, Outlet } from 'react-router-dom';

/**
 * Structural portal layouts (unopinionated markup ready for existing visual design integration).
 */
export function PublicLayout() {
  return (
    <div data-portal="public">
      <header>
        <nav aria-label="Primary Storefront">
          <Link to="/">CircleUp</Link> | <Link to="/new-arrivals">New Arrivals</Link> |{' '}
          <Link to="/rentals">Rentals</Link> | <Link to="/events">The Social Circle</Link> |{' '}
          <Link to="/thrift-crew">#ThriftCrew</Link> | <Link to="/cart">Cart</Link> |{' '}
          <Link to="/account">Account</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function CustomerLayout() {
  return (
    <div data-portal="customer-crm">
      <header>
        <nav aria-label="Customer CRM">
          <Link to="/">Storefront</Link> | <Link to="/account">Profile</Link> |{' '}
          <Link to="/account/addresses">Addresses</Link> |{' '}
          <Link to="/account/orders">Orders</Link> | <Link to="/account/rentals">Rentals</Link> |{' '}
          <Link to="/account/wishlist">Wishlist</Link> |{' '}
          <Link to="/account/notifications">Notifications</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function AdminLayout() {
  return (
    <div data-portal="owner-crm">
      <header>
        <nav aria-label="Owner CRM">
          <Link to="/admin">Dashboard</Link> | <Link to="/admin/products">Products</Link> |{' '}
          <Link to="/admin/inventory">Inventory</Link> |{' '}
          <Link to="/admin/checkout-requests">Checkout Requests</Link> |{' '}
          <Link to="/admin/orders">Orders</Link> | <Link to="/admin/rentals">Rentals</Link> |{' '}
          <Link to="/admin/community">Community</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

