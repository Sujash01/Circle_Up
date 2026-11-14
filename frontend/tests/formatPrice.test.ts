import { describe, expect, it } from 'vitest';
import { formatPrice as sharedFormatPrice } from '@circleup/shared';
import { formatInr, formatPrice as frontendFormatPrice } from '../src/services/cartService';

describe('formatPrice utility specification', () => {
  it('formats integer paise correctly via @circleup/shared', () => {
    // 255000 paise = ₹2,550
    expect(sharedFormatPrice(255000)).toBe('₹2,550');
    // 400000 paise = ₹4,000
    expect(sharedFormatPrice(400000)).toBe('₹4,000');
    // 0 paise = ₹0
    expect(sharedFormatPrice(0)).toBe('₹0');
    // Indian numbering format grouping: 12345678 paise = ₹1,23,456.78
    expect(sharedFormatPrice(12345678)).toBe('₹1,23,456.78');
    // Paise ending in zero: 255050 paise = ₹2,550.50
    expect(sharedFormatPrice(255050)).toBe('₹2,550.50');
  });

  it('formats frontend prices cleanly with tabular numerals and no trailing .00 on whole numbers', () => {
    expect(frontendFormatPrice(4000)).toBe('₹4,000');
    expect(frontendFormatPrice(2550)).toBe('₹2,550');
    expect(frontendFormatPrice(1950.5)).toBe('₹1,950.5');
    expect(frontendFormatPrice(123456)).toBe('₹1,23,456');
    expect(formatInr(4000)).toBe('₹4,000');
  });
});

