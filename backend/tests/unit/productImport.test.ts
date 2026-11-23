import { describe, expect, it } from 'vitest';
import { convertRupeesToPaise, formatPrice, normalizePriceToPaise, parseRupeesToNumber } from '@circleup/shared';
import { parseCircleUpCsv, reconcileCsvProduct } from '../../src/services/productImport.service.js';

describe('Product CSV Import & Monetary Reconciliation (P0-1)', () => {
  it('converts rupee values 550 and 350 into integer paise', () => {
    expect(convertRupeesToPaise(550)).toBe(55000);
    expect(convertRupeesToPaise(350)).toBe(35000);
    expect(convertRupeesToPaise('550')).toBe(55000);
    expect(convertRupeesToPaise('350')).toBe(35000);
    expect(formatPrice(55000)).toBe('₹550');
    expect(formatPrice(35000)).toBe('₹350');
  });

  it('converts price strings like "700 (Rental)" and "₹700" cleanly into 70000 paise (₹700)', () => {
    expect(parseRupeesToNumber('700 (Rental)')).toBe(700);
    expect(parseRupeesToNumber('₹700 (Rental)')).toBe(700);
    expect(parseRupeesToNumber('Rs. 700 (Rental)')).toBe(700);
    expect(parseRupeesToNumber(700)).toBe(700);

    expect(convertRupeesToPaise('700 (Rental)')).toBe(70000);
    expect(convertRupeesToPaise('₹700 (Rental)')).toBe(70000);
    expect(convertRupeesToPaise(700)).toBe(70000);

    expect(formatPrice(70000)).toBe('₹700');
    expect(formatPrice(convertRupeesToPaise('700 (Rental)'))).toBe('₹700');

    expect(normalizePriceToPaise('700 (Rental)')).toBe(70000);
    expect(normalizePriceToPaise(700)).toBe(70000);
    expect(normalizePriceToPaise(70000)).toBe(70000);
    expect(formatPrice(normalizePriceToPaise(700))).toBe('₹700');
    expect(formatPrice(normalizePriceToPaise('700 (Rental)'))).toBe('₹700');
  });

  it('reconciles raw CSV row for serial 160 Latex bodysuit into 70000 paise (₹700)', () => {
    const rawLatexRow = {
      code: '160',
      category_code: 'R',
      name: 'Latex bodysuit',
      size: "XS-S (bust-34', waist-28', shoulder-14', sleeve-21', length-55')",
      retail_price: '700 (Rental)',
      is_rental: 'true',
      image_drive_url: 'https://drive.google.com/file/d/11IxtRfNJVu9s_GG2XmK3JYgVUFHFOy0R/view?usp=drivesdk',
      category: 'Rental',
      product_type: 'Rental',
    };

    const reconciled = reconcileCsvProduct(rawLatexRow);
    expect(reconciled.code).toBe('160');
    expect(reconciled.name).toBe('Latex bodysuit');
    expect(reconciled.priceInRupees).toBe(700);
    expect(reconciled.priceInPaise).toBe(70000);
    expect(reconciled.formattedPrice).toBe('₹700');
    expect(reconciled.isRental).toBe(true);
    expect(formatPrice(reconciled.priceInPaise)).toBe('₹700');
  });

  it('reconciles raw CSV row into standardized paise product', () => {
    const rawRow = {
      code: '3',
      category_code: 'W',
      name: 'Dark blue zipper hoodie (Uniqlo)',
      size: "S-M (chest-38', waist-36')",
      retail_price: '550',
      is_rental: 'false',
      image_drive_url: 'https://drive.google.com/file/d/test',
      category: 'Women wear upperwear',
      product_type: 'Pre-Loved',
    };

    const reconciled = reconcileCsvProduct(rawRow);
    expect(reconciled.priceInRupees).toBe(550);
    expect(reconciled.priceInPaise).toBe(55000);
    expect(reconciled.formattedPrice).toBe('₹550');
    expect(Number.isInteger(reconciled.priceInPaise)).toBe(true);
    expect(reconciled.priceInPaise).toBeGreaterThan(0);
  });

  it('parses multi-line CSV content with rupee prices into paise products', () => {
    const csvContent = `code,category_code,name,size,retail_price,is_rental,image_drive_url,category,product_type
3,W,Dark blue zipper hoodie (Uniqlo),"S-M",550,false,https://drive.google.com/file/d/1,Women wear upperwear,Pre-Loved
25,MS,Men's winter blue shirt with stripes,"L",350,false,https://drive.google.com/file/d/2,Menswear winter upper,Pre-Loved
60,SZ,Blue zipper jacket (tommy hilfiger),"M",500,false,https://drive.google.com/file/d/3,Unisex upper,Pre-Loved`;

    const products = parseCircleUpCsv(csvContent);
    expect(products).toHaveLength(3);

    expect(products[0]?.name).toBe('Dark blue zipper hoodie (Uniqlo)');
    expect(products[0]?.priceInPaise).toBe(55000);
    expect(products[0]?.formattedPrice).toBe('₹550');

    expect(products[1]?.name).toBe("Men's winter blue shirt with stripes");
    expect(products[1]?.priceInPaise).toBe(35000);
    expect(products[1]?.formattedPrice).toBe('₹350');

    expect(products[2]?.name).toBe('Blue zipper jacket (tommy hilfiger)');
    expect(products[2]?.priceInPaise).toBe(50000);
    expect(products[2]?.formattedPrice).toBe('₹500');
  });

  it('rejects invalid or negative monetary values', () => {
    expect(() => convertRupeesToPaise(-100)).toThrow();
    expect(() => convertRupeesToPaise('invalid')).toThrow();
  });
});
