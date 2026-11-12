import type { CategoryMeta, ProductCategorySlug } from '@/types/storefront';

export const CATEGORIES: CategoryMeta[] = [
  {
    slug: 'womens-upperwear',
    title: "Women's Upperwear",
    subtitle: 'Curated tops, structured vintage blazers, and boned corsets.',
    subcategories: ['Tops', 'Blazers / Jackets', 'Corsets'],
  },
  {
    slug: 'womens-bottomwear',
    title: "Women's Bottomwear",
    subtitle: 'Pre-loved denim, wide-leg trousers, pleated skirts, shorts, and relaxed lowers.',
    subcategories: ['Jeans', 'Pants', 'Shorts', 'Skirts', 'Lowers'],
  },
  {
    slug: 'womens-one-piece',
    title: "Women's One Piece",
    subtitle: 'Slip dresses, matching co-ord sets, jumpsuits, rompers, and retro swimwear.',
    subcategories: ['Dresses', 'Co-ords', 'Jumpsuits / Rompers', 'Swimwear'],
  },
  {
    slug: 'mens-upperwear',
    title: "Men's Upperwear (Unisex)",
    subtitle: 'Boxy shirts, graphic tees, heavyweight hoodies, vintage sweatshirts, and jackets.',
    subcategories: ['Shirts', 'T-shirts', 'Hoodies', 'Sweatshirts', 'Blazers / Jackets'],
    supportsGenderFilter: true,
  },
  {
    slug: 'mens-bottomwear',
    title: "Men's Bottomwear (Unisex)",
    subtitle: 'Relaxed carpenter denim, pleated trousers, cargo shorts, and fleece lowers.',
    subcategories: ['Jeans', 'Pants', 'Shorts', 'Lowers'],
    supportsGenderFilter: true,
  },
  {
    slug: 'footwear',
    title: 'Footwear',
    subtitle: 'Checked leather boots, retro trainers, loafers, and strappy silhouettes.',
    subcategories: ['Sneakers', 'Boots', 'Loafers & Heels', 'Sandals'],
    supportsGenderFilter: true,
  },
  {
    slug: 'ethnic-wear',
    title: 'Ethnic Wear',
    subtitle: 'Pre-loved kurtas, embroidered jackets, bandhgalas, and timeless festive drapes.',
    subcategories: ["Women's Ethnic", "Men's Ethnic", 'Festive Sets'],
    supportsGenderFilter: true,
  },
  {
    slug: 'thrifted-treasure',
    title: 'Thrifted Treasure',
    subtitle: 'Smaller curiosities, one-of-a-kind trinkets, and unmistakable vintage discoveries.',
    subcategories: ['One-Off Finds', 'Vintage Accents', 'Small Carryalls', 'Retro Keepsakes'],
  },
  {
    slug: 'jewellery',
    title: 'Jewellery',
    subtitle: 'Chunky rings, heirloom chains, sculptural earrings, bracelets, and hair accents.',
    subcategories: ['Rings', 'Bracelets', 'Necklaces', 'Earrings', 'Chains', 'Hair accessories'],
    supportsGenderFilter: true,
  },
  {
    slug: 'accessories',
    title: 'Accessories',
    subtitle: 'Bags, silk scarves, shawls, stockings, caps, belts, socks, keychains, and press-on nails.',
    subcategories: [
      'Stockings',
      'Bags',
      'Scarves',
      'Shawls',
      'Socks',
      'Caps',
      'Belts',
      'Keychains',
      'Nails',
    ],
  },
  {
    slug: 'handcrafted',
    title: 'Handcrafted',
    subtitle: 'Small-batch artisan pieces, hand-crocheted layers, and upcycled studio textiles.',
    subcategories: ['Upcycled Denim', 'Crochet & Knit', 'Artisan Accents'],
  },
];

export const CATEGORY_MAP: Record<ProductCategorySlug, CategoryMeta> = CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.slug] = cat;
    return acc;
  },
  {} as Record<ProductCategorySlug, CategoryMeta>,
);

