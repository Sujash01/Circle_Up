import { RENTAL_PRODUCTS } from '@/data/rentalProducts';
import type { RentalProduct, SimulatedRentalRequest } from '@/types/storefront';
import { readStorage, writeStorage } from './storage';

const RENTAL_REQUESTS_KEY = 'circleup_rental_requests_v1';

function parseIsoDay(dayStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return null;
  const [y, m, d] = dayStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function expandDateKeys(startDate: string, endDate: string): string[] {
  const start = parseIsoDay(startDate);
  const end = parseIsoDay(endDate);
  if (!start || !end || end < start) return [];

  const keys: string[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 60) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return keys;
}

export interface RentalQuoteResult {
  valid: boolean;
  error?: string;
  durationDays: number;
  estimatedRentalFee: number;
  securityDeposit: number;
  estimatedTotal: number;
  conflictingDates: string[];
}

export const rentalService = {
  getAllRentalProducts(): RentalProduct[] {
    return RENTAL_PRODUCTS;
  },

  loadSubmittedRequests(): SimulatedRentalRequest[] {
    const data = readStorage<SimulatedRentalRequest[]>(RENTAL_REQUESTS_KEY, []);
    return Array.isArray(data) ? data : [];
  },

  getBlockedDatesForProduct(
    product: RentalProduct,
    requestsOverride?: SimulatedRentalRequest[],
  ): Set<string> {
    const blocked = new Set(product.unavailableDates);
    const localRequests = (requestsOverride ?? this.loadSubmittedRequests()).filter(
      (req) => req.rentalProductId === product.id,
    );
    for (const req of localRequests) {
      for (const day of expandDateKeys(req.startDate, req.endDate)) {
        blocked.add(day);
      }
    }
    return blocked;
  },

  evaluateQuote(
    product: RentalProduct,
    startDate: string,
    endDate: string,
    blockedOverride?: Set<string>,
  ): RentalQuoteResult {
    const start = parseIsoDay(startDate);
    const end = parseIsoDay(endDate);
    const todayIso = new Date().toISOString().slice(0, 10);

    if (!start || !end) {
      return {
        valid: false,
        error: 'Select both a valid start date and return date.',
        durationDays: 0,
        estimatedRentalFee: 0,
        securityDeposit: product.securityDeposit,
        estimatedTotal: 0,
        conflictingDates: [],
      };
    }

    if (startDate < todayIso) {
      return {
        valid: false,
        error: 'Start date cannot be in the past.',
        durationDays: 0,
        estimatedRentalFee: 0,
        securityDeposit: product.securityDeposit,
        estimatedTotal: 0,
        conflictingDates: [],
      };
    }

    if (end < start) {
      return {
        valid: false,
        error: 'Return date must be on or after the start date.',
        durationDays: 0,
        estimatedRentalFee: 0,
        securityDeposit: product.securityDeposit,
        estimatedTotal: 0,
        conflictingDates: [],
      };
    }

    const days = expandDateKeys(startDate, endDate);
    const durationDays = days.length;

    if (durationDays < product.minDays) {
      return {
        valid: false,
        error: `Minimum rental duration for this piece is ${product.minDays} days.`,
        durationDays,
        estimatedRentalFee: durationDays * product.dailyRate,
        securityDeposit: product.securityDeposit,
        estimatedTotal: durationDays * product.dailyRate + product.securityDeposit,
        conflictingDates: [],
      };
    }

    if (durationDays > product.maxDays) {
      return {
        valid: false,
        error: `Maximum rental duration for this piece is ${product.maxDays} days.`,
        durationDays,
        estimatedRentalFee: durationDays * product.dailyRate,
        securityDeposit: product.securityDeposit,
        estimatedTotal: durationDays * product.dailyRate + product.securityDeposit,
        conflictingDates: [],
      };
    }

    const blocked = blockedOverride ?? this.getBlockedDatesForProduct(product);
    const conflictingDates = days.filter((d) => blocked.has(d));
    const estimatedRentalFee = durationDays * product.dailyRate;
    const estimatedTotal = estimatedRentalFee + product.securityDeposit;

    if (conflictingDates.length > 0) {
      return {
        valid: false,
        error: `Selected range includes unavailable dates: ${conflictingDates.join(', ')}.`,
        durationDays,
        estimatedRentalFee,
        securityDeposit: product.securityDeposit,
        estimatedTotal,
        conflictingDates,
      };
    }

    return {
      valid: true,
      durationDays,
      estimatedRentalFee,
      securityDeposit: product.securityDeposit,
      estimatedTotal,
      conflictingDates: [],
    };
  },

  submitSimulatedRequest(params: {
    product: RentalProduct;
    size: string;
    startDate: string;
    endDate: string;
    customerName: string;
    customerPhone: string;
    notes?: string;
  }): { request?: SimulatedRentalRequest; error?: string } {
    const quote = this.evaluateQuote(params.product, params.startDate, params.endDate);
    if (!quote.valid) {
      return { error: quote.error || 'Invalid rental dates.' };
    }

    const record: SimulatedRentalRequest = {
      id: `SIM-RNT-${Date.now().toString(36).toUpperCase()}`,
      rentalProductId: params.product.id,
      rentalProductName: params.product.name,
      size: params.size,
      startDate: params.startDate,
      endDate: params.endDate,
      durationDays: quote.durationDays,
      estimatedRentalFee: quote.estimatedRentalFee,
      securityDeposit: quote.securityDeposit,
      estimatedTotal: quote.estimatedTotal,
      customerName: params.customerName.trim(),
      customerPhone: params.customerPhone.trim(),
      notes: params.notes?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const existing = this.loadSubmittedRequests();
    writeStorage(RENTAL_REQUESTS_KEY, [record, ...existing]);
    return { request: record };
  },
};

