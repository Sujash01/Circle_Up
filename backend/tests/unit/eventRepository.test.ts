import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError } from '../../src/errors/AppError.js';

const supabaseState = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, from: vi.fn() }));
vi.mock('../../src/services/supabase.service.js', () => ({
  getSupabaseServiceClient: () => ({ from: supabaseState.from }),
}));

import { eventRepository } from '../../src/repositories/event.repository.js';

describe('eventRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(async () => supabaseState.result),
    };
    supabaseState.from.mockReturnValue(query);
  });

  it('returns Supabase event failures as a service-unavailable error', async () => {
    supabaseState.result = { data: null, error: { message: 'connection refused' } };
    await expect(eventRepository.list(true)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(supabaseState.from).toHaveBeenCalledWith('events');
  });
});
