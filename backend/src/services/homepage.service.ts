import { productRepository } from '../repositories/product.repository.js';
import { settingsRepository } from '../repositories/settings.repository.js';
import { formatPrice } from '@circleup/shared';
import { getConfiguredWhatsappNumber } from '../repositories/settings.repository.js';

export const homepageService = {
  async getHomepagePayload() {
    const [chestProducts, readyToWearProducts, handbagProducts, settings] = await Promise.all([
      productRepository.findChestPicks(),
      productRepository.findCollectionRow('womens-one-piece', 4),
      productRepository.findCollectionRow('accessories', 4),
      settingsRepository.getSettings(),
    ]);

    // Format 4-6 chest picks for 3D treasure chest
    const chestPicks = chestProducts.slice(0, 6).map((p, idx) => {
      const bgs: Array<[string, string]> = [
        ['#c9d3b0', '#9fae80'],
        ['#e7e1ce', '#c8d3b0'],
        ['#bfd0dc', '#8aa6bc'],
        ['#e7e1ce', '#c8d3b0'],
        ['#d9cdb5', '#a89572'],
        ['#d4e2c8', '#a4ba94'],
      ];
      return {
        id: p.id || String((p as unknown as { _id: string })._id),
        name: p.name,
        price: formatPrice(p.price),
        rawPrice: p.price,
        tag: p.badge || (p.sizes?.[0] ? `Size ${p.sizes[0]}` : 'Vintage find'),
        bg: bgs[idx % bgs.length] || ['#c9d3b0', '#9fae80'],
        img: p.images[0] || '',
        to: `/product/${p.slug}`,
      };
    });

    // 4 Category World Tiles
    const defaultCategoryTiles = [
      {
        to: '/rentals',
        title: 'Rentals',
        note: 'Wear for an occasion, then return it',
        img: '/assets/rtw-3.jpg',
        alt: 'Blazer with skirt co-ord set',
      },
      {
        to: '/thrifted-treasure',
        title: 'Thrifted Treasure',
        note: 'One-of-one vintage finds',
        img: '/assets/hero-detail-1.jpg',
        alt: 'Top and skirt co-ord set on a mannequin',
      },
      {
        to: '/accessories',
        title: 'Accessories',
        note: 'Bags, scarves and small things',
        img: '/assets/bag-3.jpg',
        alt: 'Structured handheld bag',
      },
      {
        to: '/events',
        title: 'Social Circle',
        note: 'Store sales and community days',
        img: '/assets/world-social-circle.webp',
        alt: 'Warm lights and leafy branches decorate the CircleUp shop',
      },
    ];

    const categoryTiles =
      settings.categoryTiles && settings.categoryTiles.length === 4
        ? settings.categoryTiles
        : defaultCategoryTiles;

    // Winter Collection Lookbook
    const winterLooks = [
      { img: '/assets/winter-1.jpg', alt: 'Winter cardigan coat with cream trim' },
      { img: '/assets/hero-detail-2.jpg', alt: 'Denim jumpsuit with a vintage belt' },
      { img: '/assets/story-2.jpg', alt: 'Vintage-inspired knit and denim co-ord on a mannequin' },
      { img: '/assets/hero-detail-1.jpg', alt: 'Top and skirt co-ord set on a mannequin' },
    ];

    const collections = {
      readyToWear: readyToWearProducts.map((p) => ({
        id: p.id || String((p as unknown as { _id: string })._id),
        img: p.images[0] || '',
        name: p.name,
        price: formatPrice(p.price),
        rawPrice: p.price,
        to: `/product/${p.slug}`,
        category: p.category,
      })),
      handbags: handbagProducts.map((p) => ({
        id: p.id || String((p as unknown as { _id: string })._id),
        img: p.images[0] || '',
        name: p.name,
        price: formatPrice(p.price),
        rawPrice: p.price,
        to: `/product/${p.slug}`,
        category: p.category,
      })),
      winter: winterLooks,
    };

    return {
      chestPicks,
      collections,
      rows: collections,
      categoryTiles,
      marqueePhrases: settings.marqueePhrases,
      announcement: settings.announcementText,
      announcementText: settings.announcementText,
      customDrop: settings.customDrop || {
        label: 'Curated Drop',
        to: '/thrifted-treasure',
        badge: 'Featured Drop',
        description: 'Special seasonal curation from our archive',
        enabled: true,
      },
      siteSettings: {
        storeAddress: settings.storeAddress,
        contactEmail: settings.contactEmail,
        contactPhone: settings.contactPhone,
        whatsappNumber: settings.isWhatsappVerified ? getConfiguredWhatsappNumber(settings.whatsappNumber) : '',
        contentVersion: settings.contentVersion,
      },
    };
  },
};
