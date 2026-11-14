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
import { AboutPage } from '@/features/public/AboutPage';
import { CartPage } from '@/features/public/CartPage';
import { CategoryListingPage } from '@/features/public/CategoryListingPage';
import { ContactPage } from '@/features/public/ContactPage';
import { EventDetailPage } from '@/features/public/EventDetailPage';
import { EventsPage } from '@/features/public/EventsPage';
import { HandcraftedPage } from '@/features/public/HandcraftedPage';
import { HomePage } from '@/features/public/HomePage';
import { JewelleryPage } from '@/features/public/JewelleryPage';
import { NewArrivalsPage } from '@/features/public/NewArrivalsPage';
import { NotFoundPage } from '@/features/public/NotFoundPage';
import { ProductDetailPage } from '@/features/public/ProductDetailPage';
import { RentalsPage } from '@/features/public/RentalsPage';
import { ReviewsPage } from '@/features/public/ReviewsPage';
import { SearchPage } from '@/features/public/SearchPage';
import { SignInPage } from '@/features/public/SignInPage';
import { SignUpPage } from '@/features/public/SignUpPage';
import { CustomerAccountPage } from '@/features/customer/CustomerAccountPage';
import { ThriftCrewPage } from '@/features/public/ThriftCrewPage';
import { ThriftedTreasurePage } from '@/features/public/ThriftedTreasurePage';
import { WishlistPage } from '@/features/public/WishlistPage';

const AdminApp = lazy(() => import('@/admin/AdminApp'));

function RootScrollWrapper() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <>
      <Outlet />
      <ExitIntentModal />
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
          { path: 'reviews', element: <ReviewsPage /> },
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

      // Authentication and User Account routes (clean layout without notebook spiral binding)
      {
        element: <StorefrontCleanLayout />,
        children: [
          { path: 'signin', element: <SignInPage /> },
          { path: 'signup', element: <SignUpPage /> },
          { path: 'login', element: <Navigate to="/signin" replace /> },
          { path: 'register', element: <Navigate to="/signup" replace /> },
          { path: 'account', element: <CustomerAccountPage /> },
          { path: 'profile', element: <Navigate to="/account" replace /> },
        ],
      },
    ],
  },
]);
