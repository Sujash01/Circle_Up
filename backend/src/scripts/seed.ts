import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Product } from '../models/Product.js';
import { Coupon } from '../models/Coupon.js';
import { Rental } from '../models/Rental.js';
import { Event } from '../models/Event.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { adminAuthService } from '../services/adminAuth.service.js';
import { SEED_PRODUCTS } from '../data/seedProducts.js';

const LAUNCH_COUPONS = [
  {
    code: 'THRIFT10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    minOrderInPaise: 100000,
    maxDiscountInPaise: 50000,
    usageLimit: 1000,
    usedCount: 0,
    isActive: true,
  },
  {
    code: 'CIRCLE20',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    minOrderInPaise: 150000,
    maxDiscountInPaise: 100000,
    usageLimit: 500,
    usedCount: 0,
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

const DEFAULT_SETTINGS = {
  announcementText: 'Use code THRIFT10 or CIRCLE20 in bag • Plastic-free sustainable packaging on every parcel',
  marqueePhrases: [
    'Thrifted with care',
    'Rentals for every occasion',
    'Handcrafted pieces',
    'Plastic-free packaging',
    'Community sale days',
    'Fashion that lasts',
  ],
  storeAddress: 'CircleUp Studio Courtyard, Sector 7, Chandigarh',
  contactEmail: 'care@circleuponline.com',
  contactPhone: '+91 98765 43210',
  whatsappNumber: '',
  contentVersion: 1,
};

async function runSeed() {
  logger.info({ uri: env.MONGODB_URI.replace(/:[^:]*@/, ':****@') }, 'Connecting to MongoDB for catalog seed...');
  await connectDatabase();

  // 1. Seed Products
  let productCount = 0;
  for (const item of SEED_PRODUCTS as unknown as Array<Record<string, unknown>>) {
    const serial = String(item.serialNumber).toUpperCase();
    await Product.findOneAndUpdate(
      { serialNumber: serial },
      {
        $set: {
          serialNumber: serial,
          name: item.name,
          slug: item.slug,
          description: item.description,
          price: item.price,
          originalPrice: item.originalPrice,
          stock: item.stock ?? 1,
          images: item.images,
          sizes: item.sizes || [],
          category: item.category,
          categoryLabel: item.categoryLabel || '',
          subcategory: item.subcategory || '',
          productType: item.productType || 'Pre-Loved',
          condition: item.condition || 'Gently Used',
          gender: item.gender || 'Unisex',
          measurements: item.measurements || '',
          makerNote: item.makerNote || '',
          tags: item.tags || [],
          featured: item.featured ?? false,
          isNewArrival: item.isNewArrival ?? true,
          status: 'ACTIVE',
          chestPick: Boolean(item.chestPick || item.featured),
          variants: item.variants || [],
        },
      },
      { upsert: true, new: true },
    );
    productCount++;
  }
  logger.info({ count: productCount }, 'Seeded products successfully');

  // 2. Seed Coupons
  for (const coupon of LAUNCH_COUPONS) {
    await Coupon.findOneAndUpdate(
      { code: coupon.code },
      { $set: coupon },
      { upsert: true, new: true },
    );
  }
  logger.info({ count: LAUNCH_COUPONS.length }, 'Seeded launch coupons successfully');

  // 3. Seed Rentals
  for (const rental of DEFAULT_RENTALS) {
    await Rental.findOneAndUpdate(
      { slug: rental.slug },
      { $set: rental },
      { upsert: true, new: true },
    );
  }
  logger.info({ count: DEFAULT_RENTALS.length }, 'Seeded rentals successfully');

  // 4. Seed Events
  for (const evt of DEFAULT_EVENTS) {
    await Event.findOneAndUpdate(
      { title: evt.title },
      { $set: evt },
      { upsert: true, new: true },
    );
  }
  logger.info({ count: DEFAULT_EVENTS.length }, 'Seeded events successfully');

  // 5. Seed Site Settings
  await SiteSettings.findOneAndUpdate(
    {},
    { $setOnInsert: DEFAULT_SETTINGS },
    { upsert: true, new: true },
  );
  logger.info('Seeded site settings successfully');

  // 6. Seed Default Admin Users
  try {
    await adminAuthService.createAdminUser({
      email: 'owner@circleuponline.com',
      password: 'OwnerPassword123',
      name: 'CircleUp Owner',
      role: 'owner',
      force: true,
    });
    logger.info('Seeded default owner user: owner@circleuponline.com');
  } catch {
    logger.info('Owner user already exists, skipping.');
  }

  try {
    await adminAuthService.createAdminUser({
      email: 'staff@circleuponline.com',
      password: 'StaffPassword123',
      name: 'CircleUp Staff',
      role: 'staff',
      force: true,
    });
    logger.info('Seeded default staff user: staff@circleuponline.com');
  } catch {
    logger.info('Staff user already exists, skipping.');
  }

  await disconnectDatabase();
  process.exit(0);
}

runSeed().catch(async (err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'Failed to seed catalog');
  await disconnectDatabase();
  process.exit(1);
});
