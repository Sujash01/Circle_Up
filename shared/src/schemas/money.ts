import { z } from 'zod';

/**
 * -----------------------------------------------------------------------------
 * CIRCLEUP CURRENCY & FINANCIAL SPECIFICATION
 * -----------------------------------------------------------------------------
 *
 * All monetary amounts across the database, backend models, API payloads,
 * and shared interfaces are stored and transmitted as non-negative integers
 * representing PAISE (1 INR = 100 paise).
 *
 * Example:
 * - ₹2,550.00 is stored as 255000 (integer)
 * - ₹19.50 is stored as 1950 (integer)
 *
 * Storing currency as integers completely prevents IEEE 754 floating-point
 * rounding drift during checkout aggregations, tax computations, and discounts.
 */

export const moneyPaiseSchema = z
  .number()
  .int('Monetary amounts must be an integer in paise')
  .nonnegative('Monetary amounts cannot be negative');

export type MoneyInPaise = z.infer<typeof moneyPaiseSchema>;

/**
 * Single official formatter for CircleUp prices.
 *
 * Rules:
 * - Currency symbol "₹" directly preceding amount without space (e.g. "₹2,550")
 * - Comma grouped thousands (Indian numbering / locale grouping)
 * - Never includes trailing ".00" when paise is zero
 * - Displays fractional paise only when non-zero (e.g., "₹2,550.50")
 *
 * @param amountInPaise Monetary integer in paise (e.g. 255000)
 */
export function formatPrice(amountInPaise: number): string {
  if (!Number.isFinite(amountInPaise) || amountInPaise < 0) {
    return '₹0';
  }

  const rounded = Math.round(amountInPaise);
  const rupees = Math.floor(rounded / 100);
  const remainderPaise = rounded % 100;

  // Indian currency numbering format grouping (e.g., 12,34,567)
  const formattedRupees = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(rupees);

  if (remainderPaise === 0) {
    return `₹${formattedRupees}`;
  }

  const paddedPaise = remainderPaise.toString().padStart(2, '0');
  return `₹${formattedRupees}.${paddedPaise}`;
}

/**
 * Extracts a numeric rupee value from a number or string.
 * Cleanly handles formats such as:
 * - 700
 * - "700"
 * - "700 (Rental)"
 * - "₹700 (Rental)"
 * - "Rs. 700 (Rental)"
 * - "1,500"
 * - "₹2,550.50"
 *
 * @param value Number or string containing an amount in Rupees
 * @returns Clean float or integer in Rupees
 */
export function parseRupeesToNumber(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid monetary amount in rupees: ${value}`);
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid monetary input: ${String(value)}`);
  }

  const cleanStr = value.replace(/,/g, '').trim();
  // Extract the first numeric sequence (handles "700 (Rental)", "₹700", "700 / day", etc.)
  const match = cleanStr.match(/(\d+(?:\.\d+)?)/);
  if (!match || !match[1]) {
    throw new Error(`Unable to extract monetary value from: "${value}"`);
  }

  const parsed = parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid monetary amount in rupees: ${value}`);
  }

  return parsed;
}

/**
 * Safely converts an amount in Rupees (e.g. 550, "350", or "700 (Rental)")
 * to non-negative integer paise (e.g. 55000, 35000, 70000).
 *
 * @param amountInRupees Amount in Rupees (number or string)
 * @returns Non-negative integer in paise
 */
export function convertRupeesToPaise(amountInRupees: number | string): number {
  const parsed = parseRupeesToNumber(amountInRupees);
  const paise = Math.round(parsed * 100);
  return moneyPaiseSchema.parse(paise);
}

/**
 * Normalizes an arbitrary price input (raw rupee number, paise number, or string like "700 (Rental)")
 * into a guaranteed non-negative integer in paise before storage or rendering.
 *
 * Rules:
 * - If value is a string with text (e.g. "700 (Rental)", "₹700"): parses rupee amount and converts (* 100) to paise.
 * - If value is a number:
 *   - If value > 0 and value < 5000: treated as an unmultiplied raw rupee value (e.g. 700 for Latex bodysuit, 550, 350)
 *     and multiplied by 100 -> 70000 paise.
 *   - If value >= 5000: already stored as integer paise (e.g. 55000, 70000, 255000), validated and returned as integer.
 *   - If value <= 0: returns 0.
 * - If null / undefined / unparseable: returns 0.
 *
 * @param value Price input in any format
 * @returns Guaranteed non-negative integer in paise
 */
export function normalizePriceToPaise(value: unknown): number {
  if (value == null || value === '') {
    return 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    // Check if string contains annotations like "(Rental)", currency symbols, or non-digits
    if (/[a-zA-Z()₹/-]/.test(trimmed)) {
      try {
        return convertRupeesToPaise(trimmed);
      } catch {
        return 0;
      }
    }

    const cleanNum = parseFloat(trimmed.replace(/,/g, ''));
    if (!Number.isFinite(cleanNum) || cleanNum <= 0) return 0;

    // If entered as a raw rupee numeric string e.g. "700" or "550" (< 5000)
    if (cleanNum < 5000) {
      return Math.round(cleanNum * 100);
    }
    return Math.round(cleanNum);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0;
    // If value is in raw rupees (< 5000, e.g. 700 for Latex bodysuit, 550, 350, 60, 900)
    if (value < 5000) {
      return Math.round(value * 100);
    }
    return Math.round(value);
  }

  return 0;
}


