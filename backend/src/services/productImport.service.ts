import { convertRupeesToPaise, formatPrice, moneyPaiseSchema } from '@circleup/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface CsvProductRow {
  code: string;
  category_code: string;
  name: string;
  size: string;
  retail_price: string | number;
  is_rental?: string | boolean;
  image_drive_url?: string;
  category?: string;
  product_type?: string;
}

export interface ReconciledCsvProduct {
  code: string;
  categoryCode: string;
  name: string;
  size: string;
  priceInRupees: number;
  priceInPaise: number;
  formattedPrice: string;
  isRental: boolean;
  imageDriveUrl?: string;
  category?: string;
  productType?: string;
}

/**
 * Parses and converts raw CSV records from circleup_final_45_products.csv into
 * standardized integer paise products.
 */
export function reconcileCsvProduct(row: CsvProductRow): ReconciledCsvProduct {
  const rawPrice = row.retail_price;
  const priceInPaise = convertRupeesToPaise(rawPrice);
  const priceInRupees = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice).trim().replace(/[^0-9.]/g, ''));

  // Double check canonical money schema
  moneyPaiseSchema.parse(priceInPaise);

  return {
    code: String(row.code).trim(),
    categoryCode: String(row.category_code || '').trim(),
    name: String(row.name || '').trim(),
    size: String(row.size || '').trim(),
    priceInRupees,
    priceInPaise,
    formattedPrice: formatPrice(priceInPaise),
    isRental: row.is_rental === true || String(row.is_rental).toLowerCase() === 'true',
    imageDriveUrl: row.image_drive_url ? String(row.image_drive_url).trim() : undefined,
    category: row.category ? String(row.category).trim() : undefined,
    productType: row.product_type ? String(row.product_type).trim() : undefined,
  };
}

/**
 * Parses circleup_final_45_products.csv lines, converting rupee amounts into integer paise.
 */
export function parseCircleUpCsv(csvContent: string): ReconciledCsvProduct[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0]!
    .replace(/^\uFEFF/, '') // Strip UTF-8 BOM if present
    .split(',')
    .map((h) => h.trim());

  const results: ReconciledCsvProduct[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    // Basic CSV cell extraction respecting quotes
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let c = 0; c < line.length; c++) {
      const char = line[c]!;
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cells[idx] || '';
    });

    if (rowObj.retail_price && rowObj.name) {
      results.push(
        reconcileCsvProduct({
          code: rowObj.code || '',
          category_code: rowObj.category_code || '',
          name: rowObj.name || '',
          size: rowObj.size || '',
          retail_price: rowObj.retail_price,
          is_rental: rowObj.is_rental,
          image_drive_url: rowObj.image_drive_url,
          category: rowObj.category,
          product_type: rowObj.product_type,
        }),
      );
    }
  }

  // Verification Gate Check
  if (env.NODE_ENV === 'production' && !env.MONETARY_RECONCILIATION_VERIFIED) {
    logger.warn(
      'Parsed CSV products with converted integer paise, but production database activation remains blocked until MONETARY_RECONCILIATION_VERIFIED is true.',
    );
  }

  return results;
}
