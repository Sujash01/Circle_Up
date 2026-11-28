import type { CategoryMeta, ProductCategorySlug } from '@/types/storefront';

export const CATEGORIES: CategoryMeta[] = [
  {
    slug: 'womens-upperwear',
    title: "Women's Upperwear",
    subtitle: 'Curated tops, structured vintage blazers, leather coats, and boned corsets.',
    subcategories: [
      'Tops',
      'Blazers / Jackets',
      'Corsets',
      'Denim Jackets',
      'Leather Jackets',
      'Zippers & Knits',
      'Overcoats',
    ],
  },
  {
    slug: 'womens-bottomwear',
    title: "Women's Bottomwear",
    subtitle: 'Pre-loved denim, wide-leg office trousers, pleated skirts, shorts, and relaxed lowers.',
    subcategories: ['Jeans', 'Office Trousers', 'Pants', 'Shorts', 'Skirts', 'Lowers'],
  },
  {
    slug: 'womens-one-piece',
    title: "Women's One Piece",
    subtitle: 'Slip dresses, matching co-ord sets, bodysuits, jumpsuits, rompers, and retro swimwear.',
    subcategories: ['Dresses & Bodysuits', 'Co-ords', 'Jumpsuits / Rompers', 'Swimwear'],
  },
  {
    slug: 'mens-upperwear',
    title: "Men's Upperwear (Unisex)",
    subtitle: 'Boxy shirts, formal button-downs, graphic tees, heavyweight hoodies, sports zippers, and jackets.',
    subcategories: [
      'Shirts',
      'Formal Shirts',
      'Hoodies',
      'Sweatshirts & Zippers',
      'Denim & Leather Jackets',
      'Blazers / Overcoats',
    ],
    supportsGenderFilter: true,
  },
  {
    slug: 'mens-bottomwear',
    title: "Men's Bottomwear (Unisex)",
    subtitle: 'Relaxed carpenter denim, pleated office trousers, cargo shorts, and fleece lowers.',
    subcategories: ['Jeans', 'Office Trousers', 'Pants', 'Shorts', 'Lowers & Joggers'],
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
    subtitle: 'Pre-loved kurtas, embroidered sarees & blouses, bandhgalas, and timeless festive drapes.',
    subcategories: ["Women's Ethnic", "Men's Ethnic", 'Saree & Blouse', 'Festive Sets'],
    supportsGenderFilter: true,
  },
  {
    slug: 'thrifted-treasure',
    title: 'Thrifted Treasure',
    subtitle: 'Curated books, retro toys, vintage radios & electronics, collectibles, home & living, and one-off archive discoveries.',
    subcategories: ['Books', 'Toys', 'Electronics & Radio', 'Collectibles', 'Home & Living', 'One-Off Finds', 'Other'],
  },
  {
    slug: 'jewellery',
    title: 'Jewellery',
    subtitle: 'Chunky rings, counter pieces, heirloom chains, sculptural earrings, bracelets, and hair accents.',
    subcategories: ['Rings', 'Bracelets', 'Necklaces', 'Earrings', 'Chains', 'Counter Jewellery', 'Hair accessories'],
    supportsGenderFilter: true,
  },
  {
    slug: 'accessories',
    title: 'Accessories',
    subtitle: 'Bags, belts, silk scarves, ties & caps, shawls, stockings, socks, and keychains.',
    subcategories: [
      'Bags & Belts',
      'Shawls',
      'Scarves & Ties',
      'Caps & Beanies',
      'Stockings & Socks',
      'Keychains',
      'Nails',
    ],
  },
  {
    slug: 'handcrafted',
    title: 'Handcrafted',
    subtitle: 'Small-batch artisan pieces, defected DIY pieces for rework, hand-crocheted layers, and upcycled studio textiles.',
    subcategories: ['Upcycled Denim', 'Crochet & Knit', 'DIY / Distressed Rework', 'Artisan Accents'],
  },
];

export const CATEGORY_MAP: Record<ProductCategorySlug, CategoryMeta> = CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.slug] = cat;
    return acc;
  },
  {} as Record<ProductCategorySlug, CategoryMeta>,
);

