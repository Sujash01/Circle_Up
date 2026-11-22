import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableError } from '../../src/errors/AppError.js';

const supabaseState = vi.hoisted(() => ({
  insertResult: { error: null as unknown },
  queryResult: { data: [] as unknown[], error: null as unknown },
  inserts: [] as unknown[],
  from: vi.fn(),
}));
vi.mock('../../src/services/supabase.service.js', () => ({
  getSupabaseAdminClient: () => ({ from: supabaseState.from }),
}));

import { auditService } from '../../src/services/audit.service.js';
import type { AdminSessionData } from '../../src/services/adminAuth.service.js';

const actor = (role: string): AdminSessionData => ({
  userId: 'admin-1', email: 'owner@circleuponline.com', name: 'Store Operator', role: role as AdminSessionData['role'], csrfToken: 'csrf-sensitive-value', expiresAt: 1,
});

describe('auditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseState.insertResult = { error: null };
    supabaseState.queryResult = { data: [], error: null };
    supabaseState.inserts = [];
    const query = {
      insert: vi.fn(async (row: unknown) => { supabaseState.inserts.push(row); return supabaseState.insertResult; }),
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(async () => supabaseState.queryResult),
    };
    supabaseState.from.mockReturnValue(query);
  });

  it.each(['owner', 'admin', 'staff'])('records the %s actor role in Supabase', async (role) => {
    await auditService.record({ actor: actor(role), action: 'ADMIN_LOGIN', entity: 'AdminUser', entityId: 'admin-1' });
    expect(supabaseState.inserts[0]).toMatchObject({ actor_role: role, actor_id: 'admin-1', action: 'ADMIN_LOGIN' });
    expect(supabaseState.from).toHaveBeenCalledWith('activity_audit_logs');
  });

  it('redacts credentials, contact fields, and customer metadata before writing', async () => {
    await auditService.record({
      actor: actor('staff'), action: 'PRODUCT_CREATE', entity: 'Product', entityId: 'p1',
      diff: { name: 'A customer', email: 'private@example.com', customerPhone: '+919876543210', currentPassword: 'secret', csrfToken: 'csrf-secret', note: 'Contact private@example.com', description: 'Vintage blazer' },
    });
    const row = supabaseState.inserts[0] as { after_state: Record<string, unknown> };
    expect(row.after_state).toMatchObject({ name: '[REDACTED]', email: '[REDACTED]', customerPhone: '[REDACTED]', currentPassword: '[REDACTED]', csrfToken: '[REDACTED]', note: 'Contact [REDACTED]', description: 'Vintage blazer' });
    expect(JSON.stringify(row)).not.toContain('csrf-sensitive-value');
  });

  it('makes required Supabase writes fail closed and keeps ordinary writes best effort', async () => {
    supabaseState.insertResult = { error: { message: 'database unavailable' } };
    await expect(auditService.recordRequired({ actor: actor('owner'), action: 'ORDER_PAYMENT_VERIFIED', entity: 'Order', entityId: 'o1' })).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(auditService.record({ actor: actor('owner'), action: 'ADMIN_LOGOUT', entity: 'AdminUser', entityId: 'admin-1' })).resolves.toBeUndefined();
  });

  it('lists Supabase audit rows in the existing admin activity response shape and fails on read errors', async () => {
    supabaseState.queryResult = { data: [{ id: 'a1', actor_id: 'staff-1', actor_email: 'staff@circleuponline.com', actor_role: 'staff', action: 'RENTAL_UPDATE', table_name: 'Rental', record_id: 'r1', after_state: { isAvailable: false, customerEmail: 'private@example.com' }, ip_address: '192.0.2.1', user_agent: 'test-agent', created_at: '2026-11-28T00:00:00.000Z' }], error: null };
    await expect(auditService.list()).resolves.toEqual([{ id: 'a1', actorId: 'staff-1', actorEmail: 'staff@circleuponline.com', actorRole: 'staff', action: 'RENTAL_UPDATE', entity: 'Rental', entityId: 'r1', diff: { isAvailable: false, customerEmail: '[REDACTED]' }, ipAddress: '192.0.2.1', userAgent: 'test-agent', createdAt: '2026-11-28T00:00:00.000Z' }]);
    supabaseState.queryResult = { data: [], error: { message: 'read failed' } };
    await expect(auditService.list()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
