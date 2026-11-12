import bag4 from '@/assets/bag-4.jpg';
import rtw1 from '@/assets/rtw-1.jpg';
import rtw3 from '@/assets/rtw-3.jpg';
import rtw4 from '@/assets/rtw-4.jpg';
import winter1 from '@/assets/winter-1.jpg';
import type { RentalProduct } from '@/types/storefront';

export const RENTAL_PRODUCTS: RentalProduct[] = [
  {
    id: 'rnt-001',
    name: 'Editorial Tailored Blazer & Skirt Set',
    slug: 'rental-tailored-blazer-skirt-set',
    description:
      'Sharp structured two-piece set ideal for gallery openings, studio shoots, and formal evenings.',
    images: [rtw3, winter1],
    categoryLabel: 'Rental • Formal / Editorial',
    condition: 'Mint',
    sizes: ['S', 'M', 'L'],
    dailyRate: 550,
    securityDeposit: 2000,
    minDays: 2,
    maxDays: 10,
    unavailableDates: ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-26', '2026-11-27'],
    terms: [
      'Return in original garment bag; dry-cleaning is covered in the rental fee.',
      'Security deposit is refundable upon return inspection (simulated estimate only).',
      'Late returns may incur per-day extension charges.',
    ],
    availabilityLabel: 'Available',
  },
  {
    id: 'rnt-002',
    name: 'Cream-Piped Winter Overcoat',
    slug: 'rental-cream-piped-winter-overcoat',
    description:
      'Longline brushed winter coat with warm ivory piping for seasonal trips and outdoor lookbooks.',
    images: [winter1, rtw1],
    categoryLabel: 'Rental • Outerwear',
    condition: 'Mint',
    sizes: ['M', 'L'],
    dailyRate: 650,
    securityDeposit: 2500,
    minDays: 3,
    maxDays: 14,
    unavailableDates: ['2026-11-21', '2026-11-22', '2026-11-23'],
    terms: [
      'Do not iron directly on piped trim; steam only.',
      '2-day studio turnaround buffer applies between bookings.',
    ],
    availabilityLabel: 'Available',
  },
  {
    id: 'rnt-003',
    name: 'Collector Structured Leather Satchel',
    slug: 'rental-collector-structured-satchel',
    description:
      'Archival boxy satchel with saddle stitching, available for event styling and creative shoots.',
    images: [bag4],
    categoryLabel: 'Rental • Statement Bags',
    condition: 'Mint',
    sizes: ['One Size'],
    dailyRate: 700,
    securityDeposit: 3500,
    minDays: 2,
    maxDays: 7,
    unavailableDates: ['2026-11-15', '2026-11-16', '2026-11-28', '2026-11-29'],
    terms: [
      'Store upright inside the provided cotton dust bag when not in use.',
      'Avoid exposure to heavy rain or ink.',
    ],
    availabilityLabel: 'Limited Dates',
  },
  {
    id: 'rnt-004',
    name: 'Vintage Indigo Utility Jumpsuit',
    slug: 'rental-vintage-indigo-jumpsuit',
    description:
      'Heavyweight single-piece vintage denim jumpsuit for creative shoots, weekend pop-ups, and music festivals.',
    images: [rtw4, rtw3],
    categoryLabel: 'Rental • One Piece',
    condition: 'Vintage Wear',
    sizes: ['S', 'M'],
    dailyRate: 480,
    securityDeposit: 1800,
    minDays: 2,
    maxDays: 10,
    unavailableDates: ['2026-11-24', '2026-11-25'],
    terms: [
      'Normal wear is expected; please report accidental stains immediately upon return.',
      'Simulated booking requests require manual store confirmation.',
    ],
    availabilityLabel: 'Available',
  },
];

