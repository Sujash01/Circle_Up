import { logger } from '../config/logger.js';
import { rentalCatalogItemSchema, type IProductItem } from '@circleup/shared';
import { rentalRepository } from '../repositories/rental.repository.js';
import { eventRepository } from '../repositories/event.repository.js';
import { settingsRepository } from '../repositories/settings.repository.js';
import { couponRepository } from '../repositories/coupon.repository.js';
import { SEED_PRODUCTS } from '../data/seedProducts.js';
import { supabaseCatalogService } from '../services/supabaseCatalog.service.js';

const LAUNCH_COUPONS = [
  {
    code: 'THRIFT10',
    discountType: 'PERCENTAGE' as const,
    value: 10,
    minOrderAmount: 100000,
    maxDiscountAmount: 50000,
    usageLimit: 1000,
    isActive: true,
  },
  {
    code: 'CIRCLE20',
    discountType: 'PERCENTAGE' as const,
    value: 20,
    minOrderAmount: 150000,
    maxDiscountAmount: 100000,
    usageLimit: 500,
    isActive: true,
  },
];

const DEFAULT_RENTALS = [
  {
    name: 'Blazer With Skirt Co-Ord Set',
    slug: 'blazer-with-skirt-co-ord-set',
    category: 'rentals',
    image: '/assets/rtw-3.jpg',
    rentalPrice3Days: 120000,
    rentalPrice7Days: 200000,
    rentalPrice14Days: 320000,
    securityDeposit: 300000,
    condition: 'Mint',
    size: 'Size M',
    isAvailable: true,
    description: 'Structured vintage blazer paired with pleated midi skirt. Dry-cleaned and steamed before parcel dispatch.',
  },
  {
    name: 'Denim Fit & Flare Set',
    slug: 'denim-fit-and-flare-co-ord-set',
    category: 'rentals',
    image: '/assets/rtw-2.jpg',
    rentalPrice3Days: 95000,
    rentalPrice7Days: 160000,
    rentalPrice14Days: 250000,
    securityDeposit: 200000,
    condition: 'Gently Used',
    size: 'Size XS/S',
    isAvailable: true,
    description: 'Chic indigo flare set with corset waist seams. Ideal for weekend pop-ups, film shoots, and weekend outings.',
  },
];

const DEFAULT_EVENTS = [
  {
    title: 'CircleUp Studio Pop-Up Courtyard',
    date: 'Saturday, November 28, 2026 · 11:00 AM - 6:00 PM',
    location: 'Sector 7 Studio Courtyard, Chandigarh',
    description: 'Browse freshly steamed vintage co-ords, try on corset tops, and enjoy iced matcha in our courtyard garden.',
    image: '/assets/world-social-circle.webp',
    type: 'POP_UP',
    capacity: 100,
    registeredCount: 42,
    isRegistrationOpen: true,
  },
  {
    title: 'The Social Circle Community Swap Meet',
    date: 'Sunday, December 6, 2026 · 2:00 PM - 7:00 PM',
    location: 'CircleUp Loft Space, Chandigarh',
    description: 'Bring 3 pre-loved quality garments to trade with fellow thrifters. Sustainable snacks and vinyl music provided.',
    image: '/assets/community-1.webp',
    type: 'COMMUNITY',
    capacity: 50,
    registeredCount: 31,
    isRegistrationOpen: true,
  },
];

async function runSeed() {
  // 1. Seed Products into the authoritative PostgreSQL catalog.
  const seedProducts = (SEED_PRODUCTS as unknown as Array<Partial<IProductItem> & { chestPick?: boolean }>).map((item) => ({
    ...item,
    status: (item.stock ?? 1) > 0 ? 'ACTIVE' as const : 'SOLD_OUT' as const,
    chestPick: Boolean(item.chestPick || item.featured),
  }));
  const productCount = await supabaseCatalogService.seedProducts(seedProducts);
  logger.info({ count: productCount }, 'Seeded products successfully');

  // 2. Seed Coupons
  for (const coupon of LAUNCH_COUPONS) {
    await couponRepository.seedIfMissing(coupon);
  }
  logger.info({ count: LAUNCH_COUPONS.length }, 'Seeded launch coupons successfully');

  // 3. Seed Rentals
  for (const rental of DEFAULT_RENTALS) {
    await rentalRepository.seedIfMissing(rentalCatalogItemSchema.parse(rental));
  }
  logger.info({ count: DEFAULT_RENTALS.length }, 'Seeded rentals successfully');

  // 4. Seed Events
  for (const evt of DEFAULT_EVENTS) {
    await eventRepository.seedIfMissing({ ...evt, type: evt.type as 'POP_UP' | 'COMMUNITY' | 'OFFLINE_SALE', image: evt.image, registeredCount: evt.registeredCount || 0, isRegistrationOpen: evt.isRegistrationOpen ?? true });
  }
  logger.info({ count: DEFAULT_EVENTS.length }, 'Seeded events successfully');

  // 5. Seed Site Settings
  await settingsRepository.getSettings();
  logger.info('Seeded site settings successfully');

  // Administrator provisioning is explicit via `npm run admin:create`; never seed credentials.

  process.exit(0);
}

runSeed().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'Failed to seed catalog');
  process.exit(1);
});
