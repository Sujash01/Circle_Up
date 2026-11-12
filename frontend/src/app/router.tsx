import { useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ExitIntentModal } from '@/components/storefront/ExitIntentModal';
import { StorefrontLayout } from '@/components/storefront/StorefrontChrome';
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
import { ThriftCrewPage } from '@/features/public/ThriftCrewPage';
import { ThriftedTreasurePage } from '@/features/public/ThriftedTreasurePage';
import { WishlistPage } from '@/features/public/WishlistPage';

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

export const router = createBrowserRouter([
  {
    element: <RootScrollWrapper />,
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
    ],
  },
]);
