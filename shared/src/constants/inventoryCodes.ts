/**
 * Official CircleUp Thrift Inventory Categories, Statuses, and Size Charts
 * Derived from the master inventory design sheet.
 */

export const InventoryCategoryCode = {
  SET: 'SET', // co-ords
  H: 'H', // Hoodie
  MS: 'MS', // Men's Shirt
  MB_J: 'MB-J', // Men's bottoms-Jeans
  DJ: 'DJ', // Denim Jacket
  LJ: 'LJ', // Leather Jacket
  SZ: 'SZ', // Sports Zipper
  S: 'S', // Sweater plus zipper
  SC: 'SC', // Shrugs and coverup
  T: 'T', // Top
  B: 'B', // Blazer (All season)
  WB_J: 'WB-J', // Women bottom-Jeans
  CWZ: 'CWZ', // Casual winter zipper
  FS: 'FS', // Formal shirts/blouses
  OWJ: 'OWJ', // Overcoats and Winter Jackets
  DB: 'DB', // Dresses and full bodysuits
  SS: 'SS', // Shorts & Skirts
  SH: 'SH', // Shawls
  BB: 'BB', // Bags and belts
  TCE: 'TCE', // Ties, Caps, etc.
  JW: 'JW', // Jewellery
  DIY: 'DIY', // Defected pieces
  MB_O: 'MB-O', // Men's bottoms-Office
  MB_L: 'MB-L', // Men's bottoms-Lower
  WB_L: 'WB-L', // Women bottom-Lower
  WB_O: 'WB-O', // Women bottom-Office
  J: 'J', // Jewellery
  CJ: 'CJ', // Counter jewellery
  SB: 'SB', // Saree & blouse
  R: 'R', // Rental
  EX: 'EX', // Extras (toys, thrift finds etc.)
} as const;

export type InventoryCategoryCode =
  (typeof InventoryCategoryCode)[keyof typeof InventoryCategoryCode];

export interface InventoryCategoryMeta {
  code: string;
  name: string;
  department: 'Women' | 'Men' | 'Unisex' | 'Accessories' | 'Special';
  defaultCategorySlug: string;
  sizeChartType?: 'women-blazer' | 'men-blazer' | 'top-bralette' | 'men-pants' | 'dress' | 'skirt';
  description?: string;
}

export const INVENTORY_CATEGORIES: Record<string, InventoryCategoryMeta> = {
  SET: {
    code: 'SET',
    name: 'Co-Ords',
    department: 'Women',
    defaultCategorySlug: 'womens-one-piece',
    sizeChartType: 'top-bralette',
    description: 'Matching two-piece and multi-piece coordinated sets.',
  },
  H: {
    code: 'H',
    name: 'Hoodie',
    department: 'Unisex',
    defaultCategorySlug: 'mens-upperwear',
    sizeChartType: 'top-bralette',
    description: 'Heavyweight, fleece, and oversized vintage hoodies.',
  },
  MS: {
    code: 'MS',
    name: "Men's Shirt",
    department: 'Men',
    defaultCategorySlug: 'mens-upperwear',
    sizeChartType: 'men-blazer',
    description: 'Vintage button-downs, resort shirts, and casual shirts.',
  },
  'MB-J': {
    code: 'MB-J',
    name: "Men's bottoms-Jeans",
    department: 'Men',
    defaultCategorySlug: 'mens-bottomwear',
    sizeChartType: 'men-pants',
    description: "Men's vintage denim, carpenter cuts, and straight-leg jeans.",
  },
  DJ: {
    code: 'DJ',
    name: 'Denim Jacket',
    department: 'Unisex',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'women-blazer',
    description: 'Classic trucker, oversized wash, and sherpa-lined denim jackets.',
  },
  LJ: {
    code: 'LJ',
    name: 'Leather Jacket',
    department: 'Unisex',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'women-blazer',
    description: 'Biker, bomber, and archival genuine leather jackets.',
  },
  SZ: {
    code: 'SZ',
    name: 'Sports Zipper',
    department: 'Unisex',
    defaultCategorySlug: 'mens-upperwear',
    sizeChartType: 'top-bralette',
    description: 'Track jackets, athletic windbreakers, and sporty zip-ups.',
  },
  S: {
    code: 'S',
    name: 'Sweater plus zipper',
    department: 'Unisex',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'top-bralette',
    description: 'Knit cardigans, quarter-zips, and heavyweight wool sweaters.',
  },
  SC: {
    code: 'SC',
    name: 'Shrugs and coverup',
    department: 'Women',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'top-bralette',
    description: 'Lightweight shrugs, sheer overlays, and crochet coverups.',
  },
  T: {
    code: 'T',
    name: 'Top',
    department: 'Women',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'top-bralette',
    description: 'Baby tees, halter tops, camis, and graphic tops.',
  },
  B: {
    code: 'B',
    name: 'Blazer (All season)',
    department: 'Unisex',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'women-blazer',
    description: 'Tailored suit jackets, wool blazers, and oversized statements.',
  },
  'WB-J': {
    code: 'WB-J',
    name: 'Women bottom-Jeans',
    department: 'Women',
    defaultCategorySlug: 'womens-bottomwear',
    sizeChartType: 'skirt',
    description: 'High-waisted, flared, mom fit, and wide-leg denim.',
  },
  CWZ: {
    code: 'CWZ',
    name: 'Casual winter zipper',
    department: 'Unisex',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'top-bralette',
    description: 'Casual fleece zip jackets, sherpas, and quilted layers.',
  },
  FS: {
    code: 'FS',
    name: 'Formal shirts/blouses',
    department: 'Women',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'top-bralette',
    description: 'Silk blouses, organza button-downs, and office formals.',
  },
  OWJ: {
    code: 'OWJ',
    name: 'Overcoats and Winter Jackets',
    department: 'Unisex',
    defaultCategorySlug: 'womens-upperwear',
    sizeChartType: 'women-blazer',
    description: 'Trench coats, woolen long coats, and parkas.',
  },
  DB: {
    code: 'DB',
    name: 'Dresses and full bodysuits',
    department: 'Women',
    defaultCategorySlug: 'womens-one-piece',
    sizeChartType: 'dress',
    description: 'Maxi dresses, slip dresses, cocktail wear, and bodysuits.',
  },
  SS: {
    code: 'SS',
    name: 'Shorts & Skirts',
    department: 'Women',
    defaultCategorySlug: 'womens-bottomwear',
    sizeChartType: 'skirt',
    description: 'Mini skirts, pleated midis, cargo shorts, and denim skirts.',
  },
  SH: {
    code: 'SH',
    name: 'Shawls',
    department: 'Accessories',
    defaultCategorySlug: 'accessories',
    description: 'Pashminas, woolen stoles, embroidered shawls, and drapes.',
  },
  BB: {
    code: 'BB',
    name: 'Bags and belts',
    department: 'Accessories',
    defaultCategorySlug: 'accessories',
    description: 'Leather handbags, shoulder bags, totes, and vintage belts.',
  },
  TCE: {
    code: 'TCE',
    name: 'Ties, Caps, etc.',
    department: 'Accessories',
    defaultCategorySlug: 'accessories',
    description: 'Silk neckties, baseball caps, beanies, berets, and scarves.',
  },
  JW: {
    code: 'JW',
    name: 'Jewellery',
    department: 'Accessories',
    defaultCategorySlug: 'jewellery',
    description: 'Necklaces, chunky rings, earrings, and heirloom accessories.',
  },
  DIY: {
    code: 'DIY',
    name: 'Defected pieces (DIY / Upcycle)',
    department: 'Special',
    defaultCategorySlug: 'handcrafted',
    description: 'Pieces with character flaws, distressing, or ready for rework/patching.',
  },
  'MB-O': {
    code: 'MB-O',
    name: "Men's bottoms-Office",
    department: 'Men',
    defaultCategorySlug: 'mens-bottomwear',
    sizeChartType: 'men-pants',
    description: "Men's tailored formal slacks and pleated office trousers.",
  },
  'MB-L': {
    code: 'MB-L',
    name: "Men's bottoms-Lower",
    department: 'Men',
    defaultCategorySlug: 'mens-bottomwear',
    sizeChartType: 'men-pants',
    description: "Men's casual joggers, trackpants, and relaxed lounge bottoms.",
  },
  'WB-L': {
    code: 'WB-L',
    name: 'Women bottom-Lower',
    department: 'Women',
    defaultCategorySlug: 'womens-bottomwear',
    sizeChartType: 'skirt',
    description: "Women's lounge pants, joggers, and casual lowers.",
  },
  'WB-O': {
    code: 'WB-O',
    name: 'Women bottom-Office',
    department: 'Women',
    defaultCategorySlug: 'womens-bottomwear',
    sizeChartType: 'skirt',
    description: "Women's tailored formal trousers, culottes, and work slacks.",
  },
  J: {
    code: 'J',
    name: 'Jewellery (General)',
    department: 'Accessories',
    defaultCategorySlug: 'jewellery',
    description: 'Statement pieces, rings, necklaces, and bangles.',
  },
  CJ: {
    code: 'CJ',
    name: 'Counter jewellery',
    department: 'Accessories',
    defaultCategorySlug: 'jewellery',
    description: 'Display and showcase artisanal counter accessories.',
  },
  SB: {
    code: 'SB',
    name: 'Saree & blouse',
    department: 'Special',
    defaultCategorySlug: 'ethnic-wear',
    description: 'Vintage silk sarees, embroidered drapes, and heritage blouses.',
  },
  R: {
    code: 'R',
    name: 'Rental',
    department: 'Special',
    defaultCategorySlug: 'ethnic-wear',
    description: 'High-value statements reserved for events, shoots, and rentals.',
  },
  EX: {
    code: 'EX',
    name: 'Extras (toys, thrift finds etc.)',
    department: 'Special',
    defaultCategorySlug: 'thrifted-treasure',
    description: 'Trinkets, collectibles, retro toys, and odd vintage curiosities.',
  },
};

/**
 * Inventory Status Codes with visual color styles matching the inventory spreadsheet.
 */
export const InventoryStatusCode = {
  AVAILABLE: 'AVAILABLE',
  SOLD: 'SOLD',
  BOOKED: 'BOOKED',
  MISSING: 'MISSING',
  NEED_ATTENTION: 'NEED_ATTENTION',
  EXCHANGE_BARTER: 'EXCHANGE_BARTER',
  RENT: 'RENT',
} as const;

export type InventoryStatusCode =
  (typeof InventoryStatusCode)[keyof typeof InventoryStatusCode];

export interface InventoryStatusMeta {
  code: InventoryStatusCode;
  label: string;
  badgeText: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  isPurchasable: boolean;
  isPubliclyVisible: boolean;
  description: string;
}

export const INVENTORY_STATUSES: Record<InventoryStatusCode, InventoryStatusMeta> = {
  AVAILABLE: {
    code: 'AVAILABLE',
    label: 'Available (In Stock)',
    badgeText: 'Available',
    bgColor: '#edf7ee',
    textColor: '#1e4620',
    borderColor: '#c3e6cb',
    isPurchasable: true,
    isPubliclyVisible: true,
    description: 'Active and ready for immediate purchase.',
  },
  SOLD: {
    code: 'SOLD',
    label: 'Sold',
    badgeText: 'Sold Out',
    bgColor: '#d4edda', // Light Green matching spreadsheet row 1
    textColor: '#155724',
    borderColor: '#a8d5ba',
    isPurchasable: false,
    isPubliclyVisible: true,
    description: 'Successfully purchased and archived.',
  },
  BOOKED: {
    code: 'BOOKED',
    label: 'Booked / Reserved',
    badgeText: 'Booked',
    bgColor: '#ffe6cc', // Orange/Peach matching spreadsheet row 2
    textColor: '#8a3c00',
    borderColor: '#f5b57f',
    isPurchasable: false,
    isPubliclyVisible: true,
    description: 'Held or reserved for a customer.',
  },
  MISSING: {
    code: 'MISSING',
    label: 'Missing',
    badgeText: 'Missing',
    bgColor: '#ffcccc', // Red matching spreadsheet row 3
    textColor: '#842029',
    borderColor: '#f5c2c7',
    isPurchasable: false,
    isPubliclyVisible: false,
    description: 'Item missing from rack or warehouse.',
  },
  NEED_ATTENTION: {
    code: 'NEED_ATTENTION',
    label: 'Need attention (Repair etc)',
    badgeText: 'Under Restoration',
    bgColor: '#e2e3e5', // Grey matching spreadsheet row 4
    textColor: '#41464b',
    borderColor: '#d3d6d8',
    isPurchasable: false,
    isPubliclyVisible: false,
    description: 'Needs dry-cleaning, button fix, or visible mending.',
  },
  EXCHANGE_BARTER: {
    code: 'EXCHANGE_BARTER',
    label: 'Exchange / Barter',
    badgeText: 'Barter / Swap',
    bgColor: '#cfe2ff', // Blue matching spreadsheet row 5
    textColor: '#084298',
    borderColor: '#9ec5fe',
    isPurchasable: true,
    isPubliclyVisible: true,
    description: 'Eligible for wardrobe swap and circular exchange.',
  },
  RENT: {
    code: 'RENT',
    label: 'Rent',
    badgeText: 'Rental Piece',
    bgColor: '#f8d7da', // Magenta / Purple matching spreadsheet row 6
    textColor: '#6f195d',
    borderColor: '#e8a7d5',
    isPurchasable: false,
    isPubliclyVisible: true,
    description: 'Available for short-term editorial or occasion rentals.',
  },
};

/**
 * Canonical Size & Measurement Charts from the spreadsheet
 * All measurements given in inches (in).
 */

export interface MeasurementRow {
  size: 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
  [dimension: string]: string;
}

export interface SizeChartDefinition {
  id: string;
  title: string;
  targetGarments: string;
  dimensions: string[];
  rows: MeasurementRow[];
}

export const SIZE_CHARTS: Record<string, SizeChartDefinition> = {
  'women-blazer': {
    id: 'women-blazer',
    title: 'Women Blazer Size',
    targetGarments: 'Blazers, Tailored Jackets, Waistcoats',
    dimensions: ['Bust', 'Waist', 'Shoulder', 'Sleeve'],
    rows: [
      { size: 'XXS', Bust: '29-31', Waist: '23-25', Shoulder: '12.5-13', Sleeve: '20-21' },
      { size: 'XS', Bust: '31-33', Waist: '25-27', Shoulder: '13-13.5', Sleeve: '21-22' },
      { size: 'S', Bust: '33-35', Waist: '27-29', Shoulder: '13.5-14', Sleeve: '22-23' },
      { size: 'M', Bust: '35-37', Waist: '29-31', Shoulder: '14-15', Sleeve: '23-24' },
      { size: 'L', Bust: '37-39', Waist: '31-33', Shoulder: '15-15.5', Sleeve: '24-25' },
      { size: 'XL', Bust: '39-41', Waist: '33-35', Shoulder: '15.5-16', Sleeve: '25-26' },
      { size: 'XXL', Bust: '41-43', Waist: '35-37', Shoulder: '16-16.5', Sleeve: '26-27' },
    ],
  },

  'mens-blazer': {
    id: 'mens-blazer',
    title: "Men's Blazer",
    targetGarments: "Men's Blazers, Suit Jackets, Outercoats, Formal Shirts",
    dimensions: ['Chest', 'Waist', 'Shoulder', 'Sleeve', 'Length'],
    rows: [
      { size: 'XS', Chest: '34', Waist: '28', Shoulder: '16.5', Sleeve: '23.5', Length: '26' },
      { size: 'S', Chest: '36', Waist: '30', Shoulder: '17', Sleeve: '24', Length: '27' },
      { size: 'M', Chest: '38', Waist: '32', Shoulder: '17.5', Sleeve: '24.5', Length: '28' },
      { size: 'L', Chest: '40', Waist: '34', Shoulder: '18', Sleeve: '25', Length: '29' },
      { size: 'XL', Chest: '42', Waist: '36', Shoulder: '18.5', Sleeve: '25.5', Length: '30' },
      { size: 'XXL', Chest: '44', Waist: '38', Shoulder: '19', Sleeve: '26', Length: '31' },
    ],
  },

  'top-bralette': {
    id: 'top-bralette',
    title: 'Top & Bralettes',
    targetGarments: 'Tops, Bralettes, Corsets, Camis, Blouses, Hoodies, Sweaters',
    dimensions: ['Bust', 'Underbust', 'Waist', 'Shoulder'],
    rows: [
      { size: 'XXS', Bust: '28-30', Underbust: '25-26', Waist: '22-24', Shoulder: '13-13.5' },
      { size: 'XS', Bust: '30-32', Underbust: '26-27', Waist: '24-26', Shoulder: '13.5-14' },
      { size: 'S', Bust: '32-34', Underbust: '27-28', Waist: '26-28', Shoulder: '14-14.5' },
      { size: 'M', Bust: '34-36', Underbust: '28-30', Waist: '28-30', Shoulder: '14.5-15' },
      { size: 'L', Bust: '36-38', Underbust: '30-32', Waist: '30-32', Shoulder: '15-15.5' },
      { size: 'XL', Bust: '38-40', Underbust: '32-34', Waist: '32-34', Shoulder: '15.5-16' },
      { size: 'XXL', Bust: '40-42', Underbust: '34-36', Waist: '34-36', Shoulder: '16-16.5' },
    ],
  },

  'mens-pants': {
    id: 'mens-pants',
    title: "Men's pants",
    targetGarments: "Men's Jeans, Trousers, Office Slacks, Cargo Pants, Lowers",
    dimensions: ['Waist', 'Hip', 'Inseam'],
    rows: [
      { size: 'XS', Waist: '28', Hip: '34', Inseam: '29' },
      { size: 'S', Waist: '30', Hip: '36', Inseam: '30' },
      { size: 'M', Waist: '32', Hip: '38', Inseam: '31' },
      { size: 'L', Waist: '34', Hip: '40', Inseam: '32' },
      { size: 'XL', Waist: '36', Hip: '42', Inseam: '33' },
      { size: 'XXL', Waist: '38', Hip: '44', Inseam: '34' },
    ],
  },

  dress: {
    id: 'dress',
    title: 'Dresses',
    targetGarments: 'Dresses, Bodysuits, Jumpsuits, Rompers, Co-Ord Sets',
    dimensions: ['Bust', 'Waist', 'Hip', 'Shoulder'],
    rows: [
      { size: 'XXS', Bust: '28-30', Waist: '22-24', Hip: '30-32', Shoulder: '13-13.5' },
      { size: 'XS', Bust: '30-32', Waist: '24-26', Hip: '32-34', Shoulder: '13.5-14' },
      { size: 'S', Bust: '32-34', Waist: '26-28', Hip: '34-36', Shoulder: '14-14.5' },
      { size: 'M', Bust: '34-36', Waist: '28-30', Hip: '36-38', Shoulder: '14.5-15' },
      { size: 'L', Bust: '36-38', Waist: '30-32', Hip: '38-40', Shoulder: '15-15.5' },
      { size: 'XL', Bust: '38-40', Waist: '32-34', Hip: '40-42', Shoulder: '15.5-16' },
      { size: 'XXL', Bust: '40-42', Waist: '34-36', Hip: '42-44', Shoulder: '16-16.5' },
    ],
  },

  skirt: {
    id: 'skirt',
    title: 'Skirts & Bottoms',
    targetGarments: 'Skirts, Shorts, Women Denim Jeans, Lowers, Office Pants',
    dimensions: ['Waist', 'Hip'],
    rows: [
      { size: 'XXS', Waist: '22-24', Hip: '30-32' },
      { size: 'XS', Waist: '24-26', Hip: '32-34' },
      { size: 'S', Waist: '26-28', Hip: '34-36' },
      { size: 'M', Waist: '28-30', Hip: '36-38' },
      { size: 'L', Waist: '30-32', Hip: '38-40' },
      { size: 'XL', Waist: '32-34', Hip: '40-42' },
      { size: 'XXL', Waist: '34-36', Hip: '42-44' },
    ],
  },
};

/**
 * Extracts category code from a serial number string (e.g. "B-0042" -> "B", "MB-J-001" -> "MB-J").
 */
export function extractCategoryCodeFromSerial(serialNumber: string): string | undefined {
  if (!serialNumber) return undefined;
  const upper = serialNumber.trim().toUpperCase();

  // Multi-segment codes first (e.g. MB-J, WB-J, MB-O, MB-L, WB-L, WB-O, CWZ, OWJ, TCE, DIY, SET)
  const sortedCodes = Object.keys(INVENTORY_CATEGORIES).sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (upper.startsWith(`${code}-`) || upper.startsWith(`${code}_`) || upper === code) {
      return code;
    }
  }

  return undefined;
}

/**
 * Resolves the appropriate size chart for a given category code or subcategory.
 */
export function resolveSizeChartForCategory(
  categoryCodeOrSlug?: string,
): SizeChartDefinition | undefined {
  if (!categoryCodeOrSlug) return undefined;

  const upper = categoryCodeOrSlug.toUpperCase();
  const meta = INVENTORY_CATEGORIES[upper];

  if (meta?.sizeChartType && SIZE_CHARTS[meta.sizeChartType]) {
    return SIZE_CHARTS[meta.sizeChartType];
  }

  // Fallbacks by keywords
  const lower = categoryCodeOrSlug.toLowerCase();
  if (lower.includes('blazer') || lower.includes('jacket') || lower.includes('coat')) {
    return lower.includes('men') ? SIZE_CHARTS['mens-blazer'] : SIZE_CHARTS['women-blazer'];
  }
  if (lower.includes('dress') || lower.includes('one-piece') || lower.includes('co-ord')) {
    return SIZE_CHARTS['dress'];
  }
  if (lower.includes('skirt') || lower.includes('short') || lower.includes('women') && lower.includes('jean')) {
    return SIZE_CHARTS['skirt'];
  }
  if (lower.includes('pant') || lower.includes('trouser') || lower.includes('lower') || lower.includes('men')) {
    return SIZE_CHARTS['mens-pants'];
  }
  if (lower.includes('top') || lower.includes('shirt') || lower.includes('bralette') || lower.includes('hoodie')) {
    return SIZE_CHARTS['top-bralette'];
  }

  return undefined;
}

/**
 * Safely formats a product serial number for public customer display,
 * preventing accidental exposure of internal 36-character database UUIDs.
 */
export function formatDisplaySerial(serialNumber?: string | null, id?: string | null): string {
  const isUuid = (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

  if (serialNumber && serialNumber.trim().length > 0 && !isUuid(serialNumber)) {
    return serialNumber.trim().toUpperCase();
  }

  if (id && id.trim().length > 0) {
    const cleanId = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `CU-${cleanId.slice(0, 6)}`;
  }

  return 'CU-PIECE';
}

/**
 * Extracts a clean, concise size code (e.g. "L", "S-M", "One Size", "UK 3")
 * from complex raw inventory strings containing embedded measurements.
 */
export function cleanSizeLabel(rawSize?: string | null): string {
  if (!rawSize || typeof rawSize !== 'string') {
    return 'One Size';
  }

  const trimmed = rawSize.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') {
    return 'One Size';
  }

  // If the size string begins with measurement brackets like "(length-14')" or "{bust-32'}"
  if (trimmed.startsWith('(') || trimmed.startsWith('{')) {
    return 'One Size';
  }

  // If size contains delimiter before measurements, e.g. "L {Kurti..." or "S-M (chest..."
  const beforeBracket = trimmed.split(/[{\(]/)[0]?.trim();
  if (beforeBracket && beforeBracket.length > 0) {
    if (/^UK\s*\d+$/i.test(beforeBracket)) {
      return beforeBracket.replace(/^UK\s*(\d+)$/i, 'UK $1');
    }
    return beforeBracket;
  }

  // Normalize UK sizes like "UK4" -> "UK 4"
  if (/^UK\s*\d+$/i.test(trimmed)) {
    return trimmed.replace(/^UK\s*(\d+)$/i, 'UK $1');
  }

  return trimmed;
}

/**
 * Extracts detailed measurements string from raw inventory size strings.
 */
export function extractMeasurementsFromSizeString(rawSize?: string | null): string | undefined {
  if (!rawSize || typeof rawSize !== 'string') return undefined;

  const match = rawSize.match(/[{(\[](.*)[})\]]/);
  if (match && match[1]) {
    return match[1].trim();
  }

  return undefined;
}

