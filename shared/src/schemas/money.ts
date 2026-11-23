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
 * Safely converts an amount in Rupees (e.g. 550 or "350") to non-negative integer paise (e.g. 55000 or 35000).
 *
 * @param amountInRupees Amount in Rupees (number or string)
 * @returns Non-negative integer in paise
 */
export function convertRupeesToPaise(amountInRupees: number | string): number {
  const parsed =
    typeof amountInRupees === 'string'
      ? parseFloat(amountInRupees.trim().replace(/[^0-9.-]/g, ''))
      : amountInRupees;

  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid monetary amount in rupees: ${amountInRupees}`);
  }

  const paise = Math.round(parsed * 100);
  return moneyPaiseSchema.parse(paise);
}


