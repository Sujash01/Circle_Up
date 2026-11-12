import { createBrowserRouter } from 'react-router-dom';
import { HomePage } from '../features/public/HomePage';
import { PlaceholderPage } from '../features/shared/PlaceholderPage';
import {
  AdminGuestOnly,
  GuestOnly,
  RequireAdmin,
  RequireCustomer,
} from '../shared/components/guards/RouteGuards';
import {
  AdminLayout,
  CustomerLayout,
  PublicLayout,
} from '../shared/components/layouts/PortalLayouts';

export const router = createBrowserRouter([
  // A. PUBLIC WEBSITE
  {
    path: '/',
    element: <HomePage />,
  },
  {
    element: <PublicLayout />,
    children: [
      { path: 'new-arrivals', element: <PlaceholderPage title="New Arrivals" milestone="M2" showHealthProbe /> },
      { path: 'shop/:categorySlug', element: <PlaceholderPage title="Category Catalog" milestone="M2" /> },
      { path: 'rentals', element: <PlaceholderPage title="Rental Section" milestone="M5" /> },
      { path: 'products/:slug', element: <PlaceholderPage title="Product Details" milestone="M2" /> },
      { path: 'cart', element: <PlaceholderPage title="Shopping Cart" milestone="M3" /> },
      { path: 'checkout/whatsapp', element: <PlaceholderPage title="WhatsApp Checkout" milestone="M3" /> },
      { path: 'about', element: <PlaceholderPage title="About Us" milestone="M2" /> },
      { path: 'contact', element: <PlaceholderPage title="Contact" milestone="M2" /> },
      { path: 'reviews', element: <PlaceholderPage title="Reviews" milestone="M6" /> },
      { path: 'events', element: <PlaceholderPage title="Events / The Social Circle" milestone="M6" /> },
      { path: 'events/:slug', element: <PlaceholderPage title="Event Details" milestone="M6" /> },
      { path: 'thrift-crew', element: <PlaceholderPage title="#ThriftCrew" milestone="M6" /> },
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', element: <PlaceholderPage title="Customer Login" milestone="M1" /> },
          { path: 'register', element: <PlaceholderPage title="Customer Registration" milestone="M1" /> },
          { path: 'forgot-password', element: <PlaceholderPage title="Forgot Password" milestone="M1" /> },
          { path: 'reset-password/:token', element: <PlaceholderPage title="Reset Password" milestone="M1" /> },
        ],
      },
      { path: 'verify-email/:token', element: <PlaceholderPage title="Verify Email" milestone="M1" /> },
    ],
  },

  // B. CUSTOMER CRM
  {
    path: '/account',
    element: <RequireCustomer />,
    children: [
      {
        element: <CustomerLayout />,
        children: [
          { index: true, element: <PlaceholderPage title="Profile Management" milestone="M1" /> },
          { path: 'addresses', element: <PlaceholderPage title="Address Management" milestone="M1" /> },
          { path: 'orders', element: <PlaceholderPage title="Order History" milestone="M4" /> },
          { path: 'orders/:orderId', element: <PlaceholderPage title="Order Details" milestone="M4" /> },
          { path: 'rentals', element: <PlaceholderPage title="Rental History" milestone="M5" /> },
          { path: 'rentals/:rentalId', element: <PlaceholderPage title="Rental Details" milestone="M5" /> },
          { path: 'wishlist', element: <PlaceholderPage title="Wishlist" milestone="M6" /> },
          { path: 'cart', element: <PlaceholderPage title="Account Cart" milestone="M3" /> },
          { path: 'notifications', element: <PlaceholderPage title="Notifications" milestone="M4" /> },
          { path: 'reviews', element: <PlaceholderPage title="My Reviews" milestone="M6" /> },
          { path: 'community', element: <PlaceholderPage title="Community Participation" milestone="M6" /> },
          { path: 'support', element: <PlaceholderPage title="Support" milestone="M6" /> },
        ],
      },
    ],
  },

  // C. OWNER CRM
  {
    path: '/admin/login',
    element: (
      <AdminGuestOnly>
        <PlaceholderPage title="Admin Login" milestone="M1" />
      </AdminGuestOnly>
    ),
  },
  {
    path: '/admin',
    element: <RequireAdmin />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <PlaceholderPage title="Owner Dashboard" milestone="M7" /> },
          { path: 'analytics', element: <PlaceholderPage title="Analytics" milestone="M7" /> },
          { path: 'products', element: <PlaceholderPage title="Product Management" milestone="M2" /> },
          { path: 'categories', element: <PlaceholderPage title="Category Management" milestone="M2" /> },
          { path: 'inventory', element: <PlaceholderPage title="Inventory Management" milestone="M2" /> },
          { path: 'orders', element: <PlaceholderPage title="Order Management" milestone="M4" /> },
          { path: 'checkout-requests', element: <PlaceholderPage title="Checkout Request Queue" milestone="M3" /> },
          { path: 'rentals', element: <PlaceholderPage title="Rental Management" milestone="M5" /> },
          { path: 'customers', element: <PlaceholderPage title="Customer Management" milestone="M7" /> },
          { path: 'reviews', element: <PlaceholderPage title="Review Moderation" milestone="M6" /> },
          { path: 'events', element: <PlaceholderPage title="Event Management" milestone="M6" /> },
          { path: 'community', element: <PlaceholderPage title="Community Moderation" milestone="M6" /> },
          { path: 'content', element: <PlaceholderPage title="Website Content CMS" milestone="M2" /> },
          { path: 'notifications', element: <PlaceholderPage title="Admin Notifications" milestone="M4" /> },
          { path: 'settings', element: <PlaceholderPage title="Admin Settings" milestone="M7" /> },
          { path: 'audit-logs', element: <PlaceholderPage title="Audit Logs" milestone="M7" /> },
        ],
      },
    ],
  },
]);
