import { lazy, Suspense, useEffect } from 'react';
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Link,
  Navigate,
  Outlet,
  useLocation,
  useRouteError,
} from 'react-router-dom';
import { ExitIntentModal } from '@/components/storefront/ExitIntentModal';
import { StorefrontCleanLayout, StorefrontLayout } from '@/components/storefront/StorefrontChrome';
import { HomePage } from '@/features/public/HomePage';
import { GuestRoute } from '@/components/auth/GuestRoute';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// Route-based code splitting: Lazy-load non-landing storefront routes on demand
const AboutPage = lazy(() => import('@/features/public/AboutPage').then((m) => ({ default: m.AboutPage })));
const BrandNewPage = lazy(() => import('@/features/public/BrandNewPage').then((m) => ({ default: m.BrandNewPage })));
const CartPage = lazy(() => import('@/features/public/CartPage').then((m) => ({ default: m.CartPage })));
const CategoryListingPage = lazy(() => import('@/features/public/CategoryListingPage').then((m) => ({ default: m.CategoryListingPage })));
const ContactPage = lazy(() => import('@/features/public/ContactPage').then((m) => ({ default: m.ContactPage })));
const EventDetailPage = lazy(() => import('@/features/public/EventDetailPage').then((m) => ({ default: m.EventDetailPage })));
const EventsPage = lazy(() => import('@/features/public/EventsPage').then((m) => ({ default: m.EventsPage })));
const HandcraftedPage = lazy(() => import('@/features/public/HandcraftedPage').then((m) => ({ default: m.HandcraftedPage })));
const JewelleryPage = lazy(() => import('@/features/public/JewelleryPage').then((m) => ({ default: m.JewelleryPage })));
const NewArrivalsPage = lazy(() => import('@/features/public/NewArrivalsPage').then((m) => ({ default: m.NewArrivalsPage })));
const NotFoundPage = lazy(() => import('@/features/public/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const ProductDetailPage = lazy(() => import('@/features/public/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })));
const RentalsPage = lazy(() => import('@/features/public/RentalsPage').then((m) => ({ default: m.RentalsPage })));
const ReviewsPage = lazy(() => import('@/features/public/ReviewsPage').then((m) => ({ default: m.ReviewsPage })));
const SearchPage = lazy(() => import('@/features/public/SearchPage').then((m) => ({ default: m.SearchPage })));
const SignInPage = lazy(() => import('@/features/public/SignInPage').then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import('@/features/public/SignUpPage').then((m) => ({ default: m.SignUpPage })));
const SitemapPage = lazy(() => import('@/features/public/SitemapPage').then((m) => ({ default: m.SitemapPage })));
const CustomerAccountPage = lazy(() => import('@/features/customer/CustomerAccountPage').then((m) => ({ default: m.CustomerAccountPage })));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const AuthCallbackPage = lazy(() => import('@/features/auth/AuthCallbackPage').then((m) => ({ default: m.AuthCallbackPage })));
const ThriftCrewPage = lazy(() => import('@/features/public/ThriftCrewPage').then((m) => ({ default: m.ThriftCrewPage })));
const ThriftedPage = lazy(() => import('@/features/public/ThriftedPage').then((m) => ({ default: m.ThriftedPage })));
const ThriftedTreasurePage = lazy(() => import('@/features/public/ThriftedTreasurePage').then((m) => ({ default: m.ThriftedTreasurePage })));
const WishlistPage = lazy(() => import('@/features/public/WishlistPage').then((m) => ({ default: m.WishlistPage })));
const PrivacyPolicyPage = lazy(() => import('@/features/public/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })));
const TermsPage = lazy(() => import('@/features/public/TermsPage').then((m) => ({ default: m.TermsPage })));
const ReturnsRefundsPage = lazy(() => import('@/features/public/ReturnsRefundsPage').then((m) => ({ default: m.ReturnsRefundsPage })));
const ShippingPolicyPage = lazy(() => import('@/features/public/ShippingPolicyPage').then((m) => ({ default: m.ShippingPolicyPage })));
const AdminApp = lazy(() => import('@/admin/AdminApp'));
const VinylMusicPlayer = lazy(() => import('@/components/audio/VinylMusicPlayer').then((m) => ({ default: m.VinylMusicPlayer })));

function RootScrollWrapper() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      <ExitIntentModal />
      <Suspense fallback={null}>
        <VinylMusicPlayer />
      </Suspense>
    </>
  );
}

function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected application error occurred.';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8f4e2] text-[#272727]">
      <div className="max-w-md w-full bg-card p-8 rounded-2xl border-2 border-foreground/20 text-center space-y-4 shadow-md">
        <p className="text-xs font-bold uppercase tracking-widest text-terracotta">CircleUp</p>
        <h1 className="font-display text-2xl sm:text-3xl text-forest-deep">Something took a wrong turn</h1>
        <p className="text-sm text-foreground/70">{message}</p>
        <div className="pt-2 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-forest-deep px-5 py-2 text-xs font-bold text-white hover:bg-forest transition-colors"
          >
            Reload
          </button>
          <Link
            to="/"
            className="rounded-full border border-forest/30 px-5 py-2 text-xs font-bold text-forest hover:bg-forest/5 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  // Admin App: Lazy-loaded independently outside storefront chrome and exit modals
  {
    path: 'admin/*',
    errorElement: <RouteErrorBoundary />,
    element: (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    ),
  },
  {
    element: <RootScrollWrapper />,
    errorElement: <RouteErrorBoundary />,
    children: [
      // Preserved landing homepage
      {
        path: '/',
        element: <HomePage />,
      },

      // Complete storefront pages wrapped in matching CircleUp editorial frame
      {
        element: <StorefrontLayout />,
        children: [
          { path: 'brand-new', element: <BrandNewPage /> },
          { path: 'thrifted', element: <ThriftedPage /> },
          { path: 'new-arrivals', element: <NewArrivalsPage /> },
          {
            path: 'womens-upperwear',
            element: <CategoryListingPage categorySlug="womens-upperwear" />,
          },
          {
            path: 'womens-bottomwear',
            element: <CategoryListingPage categorySlug="womens-bottomwear" />,
          },
          {
            path: 'womens-one-piece',
            element: <CategoryListingPage categorySlug="womens-one-piece" />,
          },
          {
            path: 'mens-upperwear',
            element: <CategoryListingPage categorySlug="mens-upperwear" />,
          },
          {
            path: 'mens-bottomwear',
            element: <CategoryListingPage categorySlug="mens-bottomwear" />,
          },
          {
            path: 'footwear',
            element: <CategoryListingPage categorySlug="footwear" aspectClass="aspect-square" />,
          },
          {
            path: 'ethnic-wear',
            element: <CategoryListingPage categorySlug="ethnic-wear" />,
          },
          { path: 'rentals', element: <RentalsPage /> },
          { path: 'thrifted-treasure', element: <ThriftedTreasurePage /> },
          { path: 'jewellery', element: <JewelleryPage /> },
          {
            path: 'accessories',
            element: <CategoryListingPage categorySlug="accessories" aspectClass="aspect-square" />,
          },
          { path: 'handcrafted', element: <HandcraftedPage /> },

          { path: 'product/:slug', element: <ProductDetailPage /> },
          { path: 'cart', element: <CartPage /> },
          { path: 'wishlist', element: <WishlistPage /> },
          { path: 'search', element: <SearchPage /> },

          { path: 'about', element: <AboutPage /> },
          { path: 'contact', element: <ContactPage /> },
          { path: 'sitemap', element: <SitemapPage /> },
          { path: 'reviews', element: <ReviewsPage /> },
          { path: 'privacy-policy', element: <PrivacyPolicyPage /> },
          { path: 'terms', element: <TermsPage /> },
          { path: 'returns-refunds', element: <ReturnsRefundsPage /> },
          { path: 'shipping-policy', element: <ShippingPolicyPage /> },
          { path: 'events', element: <EventsPage /> },
          { path: 'events/:id', element: <EventDetailPage /> },
          { path: 'thriftcrew', element: <ThriftCrewPage /> },

          // Clean route aliases
          { path: 'thrift-crew', element: <Navigate to="/thriftcrew" replace /> },
          { path: 'checkout/whatsapp', element: <Navigate to="/cart" replace /> },

          // 404 fallback
          { path: '*', element: <NotFoundPage /> },
        ],
      },

      // Authentication, Password Recovery and User Account routes
      {
        element: <StorefrontCleanLayout />,
        children: [
          // Guest-only routes (redirect authenticated users away)
          {
            element: <GuestRoute />,
            children: [
              { path: 'signin', element: <SignInPage /> },
              { path: 'signup', element: <SignUpPage /> },
              { path: 'login', element: <Navigate to="/signin" replace /> },
              { path: 'register', element: <Navigate to="/signup" replace /> },
              { path: 'forgot-password', element: <ForgotPasswordPage /> },
            ],
          },
          // Password reset & auth callback flows
          { path: 'auth/callback', element: <AuthCallbackPage /> },
          { path: 'auth/reset-password', element: <ResetPasswordPage /> },
          { path: 'reset-password', element: <Navigate to="/auth/reset-password" replace /> },

          // Protected user account routes (redirect unauthenticated users to /signin)
          {
            element: <ProtectedRoute />,
            children: [
              { path: 'account', element: <CustomerAccountPage /> },
              { path: 'profile', element: <Navigate to="/account" replace /> },
            ],
          },
        ],
      },
    ],
  },
]);
