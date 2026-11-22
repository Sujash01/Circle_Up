import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError } from '../../src/errors/AppError.js';

const supabaseState = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, from: vi.fn() }));
vi.mock('../../src/services/supabase.service.js', () => ({ getSupabaseServiceClient: () => ({ from: supabaseState.from }) }));

import { mapRental, rentalRepository } from '../../src/repositories/rental.repository.js';

describe('rentalRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { select: vi.fn(() => query), order: vi.fn(async () => supabaseState.result) };
    supabaseState.from.mockReturnValue(query);
  });

  it('maps every rental catalogue field, including image, rates, deposit and availability', () => {
    expect(mapRental({ id: 'r1', name: 'Co-Ord', slug: 'co-ord', category: 'rentals', image_url: '/r.webp', rental_price_3_days_paise: 120000, rental_price_7_days_paise: 200000, rental_price_14_days_paise: 320000, security_deposit_paise: 300000, condition: 'Mint', size: 'M', is_available: false, description: 'Set', created_at: '2026-11-20T00:00:00Z' })).toMatchObject({ id: 'r1', image: '/r.webp', rentalPrice3Days: 120000, rentalPrice7Days: 200000, rentalPrice14Days: 320000, securityDeposit: 300000, isAvailable: false });
  });

  it('returns Supabase catalogue failures as service-unavailable errors', async () => {
    supabaseState.result = { data: null, error: { message: 'connection refused' } };
    await expect(rentalRepository.list(true)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(supabaseState.from).toHaveBeenCalledWith('rental_catalog_items');
  });
});
