import { describe, expect, it } from 'vitest';
import {
  cleanSizeLabel,
  extractMeasurementsFromSizeString,
  formatDisplaySerial,
} from '@circleup/shared';

describe('Inventory Formatters & Hardening (Phase D)', () => {
  describe('formatDisplaySerial', () => {
    it('preserves valid, human-readable serial numbers', () => {
      expect(formatDisplaySerial('3504', '4b00bddd-5e4d-47e3-883d-dd48d57775a5')).toBe('3504');
      expect(formatDisplaySerial('KEN-025', '4b00bddd-5e4d-47e3-883d-dd48d57775a5')).toBe('KEN-025');
      expect(formatDisplaySerial('SET-001', '4b00bddd-5e4d-47e3-883d-dd48d57775a5')).toBe('SET-001');
    });

    it('rejects raw 36-character UUIDs passed as serial numbers and formats a safe reference', () => {
      const rawUuid = '4b00bddd-5e4d-47e3-883d-dd48d57775a5';
      const formatted = formatDisplaySerial(rawUuid, rawUuid);
      expect(formatted).not.toContain(rawUuid);
      expect(formatted).toBe('CU-4B00BD');
    });

    it('generates a safe CU- prefix when serial number is missing or undefined', () => {
      const uuid = 'e1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c';
      expect(formatDisplaySerial(undefined, uuid)).toBe('CU-E1A2B3');
      expect(formatDisplaySerial(null, uuid)).toBe('CU-E1A2B3');
      expect(formatDisplaySerial('', uuid)).toBe('CU-E1A2B3');
    });

    it('falls back to CU-PIECE when both serial and id are empty or unavailable', () => {
      expect(formatDisplaySerial(null, null)).toBe('CU-PIECE');
      expect(formatDisplaySerial('', '')).toBe('CU-PIECE');
    });
  });

  describe('cleanSizeLabel', () => {
    it('extracts clean size code from complex multi-garment strings (e.g. Kurti 3504)', () => {
      const raw =
        "L {Kurti (bust-46', waist-46', hip-48', shoulder-17', sleeve-15', length-30') Pants (waist-36' to 38', hip-50', inseam-24')}";
      expect(cleanSizeLabel(raw)).toBe('L');
    });

    it('extracts clean size codes with parenthesized measurements', () => {
      expect(cleanSizeLabel("S-M (chest-38', waist-36', shoulder-16', sleeve-24', length-24')")).toBe('S-M');
      expect(cleanSizeLabel("XS-S (bust-34', waist-28', shoulder-14', sleeve-21', length-55')")).toBe('XS-S');
      expect(cleanSizeLabel("XL (bust-48', underbust-44', shoulder-16.5', length-13.5')")).toBe('XL');
      expect(cleanSizeLabel("M (chest-44', waist-44', shoulder-19', sleeve-26', length-26')")).toBe('M');
    });

    it('falls back to One Size when string starts with measurement brackets', () => {
      expect(cleanSizeLabel("(length-14')")).toBe('One Size');
      expect(cleanSizeLabel("(waist-26')")).toBe('One Size');
      expect(cleanSizeLabel("{bust-32'}")).toBe('One Size');
    });

    it('normalizes UK footwear sizes', () => {
      expect(cleanSizeLabel('UK 3')).toBe('UK 3');
      expect(cleanSizeLabel('UK4')).toBe('UK 4');
      expect(cleanSizeLabel('uk7')).toBe('UK 7');
    });

    it('handles dash or missing size gracefully', () => {
      expect(cleanSizeLabel('-')).toBe('One Size');
      expect(cleanSizeLabel('—')).toBe('One Size');
      expect(cleanSizeLabel('')).toBe('One Size');
      expect(cleanSizeLabel(null)).toBe('One Size');
      expect(cleanSizeLabel(undefined)).toBe('One Size');
    });

    it('preserves simple standard sizes', () => {
      expect(cleanSizeLabel('M')).toBe('M');
      expect(cleanSizeLabel('XL')).toBe('XL');
      expect(cleanSizeLabel('One Size')).toBe('One Size');
    });
  });

  describe('extractMeasurementsFromSizeString', () => {
    it('extracts embedded measurement details from brackets', () => {
      const raw = "L {Kurti (bust-46') Pants (waist-36')}";
      const extracted = extractMeasurementsFromSizeString(raw);
      expect(extracted).toContain("Kurti (bust-46')");
      expect(extracted).toContain("Pants (waist-36')");
    });

    it('returns undefined when no measurement brackets exist', () => {
      expect(extractMeasurementsFromSizeString('M')).toBeUndefined();
      expect(extractMeasurementsFromSizeString('One Size')).toBeUndefined();
      expect(extractMeasurementsFromSizeString(null)).toBeUndefined();
    });
  });
});
