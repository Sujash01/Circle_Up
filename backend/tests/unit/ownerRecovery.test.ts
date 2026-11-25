import { describe, expect, it, vi, beforeEach } from 'vitest';
import argon2 from 'argon2';
import {
  TARGET_OWNER_UUID,
  TARGET_NEW_EMAIL,
  TARGET_NEW_NAME,
  TARGET_ROLE,
  validateRecoveryPassword,
  hashOwnerPassword,
  generateRecoverySql,
  executeRecovery,
} from '../../../scripts/recover-production-owner.mjs';

describe('Production Owner Account Recovery Utility', () => {
  describe('Constants', () => {
    it('targets the verified Owner UUID and email', () => {
      expect(TARGET_OWNER_UUID).toBe('4b00bddd-5e4d-47e3-883d-dd48d57775a5');
      expect(TARGET_NEW_EMAIL).toBe('circleup.023@gmail.com');
      expect(TARGET_NEW_NAME).toBe('CircleUp');
      expect(TARGET_ROLE).toBe('owner');
    });
  });

  describe('Password Validation & Argon2id Hashing', () => {
    it('rejects empty or non-string passwords', () => {
      expect(() => validateRecoveryPassword('')).toThrow('Password must be provided.');
      expect(() => validateRecoveryPassword(null as any)).toThrow('Password must be provided.');
    });

    it('rejects passwords shorter than 10 characters', () => {
      expect(() => validateRecoveryPassword('Short1!')).toThrow('at least 10 characters');
    });

    it('rejects passwords without uppercase letters', () => {
      expect(() => validateRecoveryPassword('circleup12345!')).toThrow('uppercase letter');
    });

    it('rejects passwords without lowercase letters', () => {
      expect(() => validateRecoveryPassword('CIRCLEUP12345!')).toThrow('lowercase letter');
    });

    it('rejects passwords without numeric digits', () => {
      expect(() => validateRecoveryPassword('CircleUpSecure!')).toThrow('at least one digit');
    });

    it('accepts compliant strong passwords', () => {
      expect(() => validateRecoveryPassword('CircleUp2026Secure!')).not.toThrow();
    });

    it('generates a valid Argon2id hash for compliant passwords', async () => {
      const password = 'StrongPassword123!';
      const hash = await hashOwnerPassword(password);
      expect(hash.startsWith('$argon2id$')).toBe(true);
      const isMatch = await argon2.verify(hash, password);
      expect(isMatch).toBe(true);
      const isWrong = await argon2.verify(hash, 'WrongPassword123!');
      expect(isWrong).toBe(false);
    });
  });

  describe('Transaction SQL Generation', () => {
    it('throws if hash is not a valid Argon2id string', () => {
      expect(() => generateRecoverySql('plaintext')).toThrow('Valid Argon2id hash is required');
      expect(() => generateRecoverySql('')).toThrow('Valid Argon2id hash is required');
    });

    it('generates a complete, transaction-safe SQL script with all safety checks', async () => {
      const dummyHash = await argon2.hash('DummySecret123!', { type: argon2.argon2id });
      const sql = generateRecoverySql(dummyHash);

      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('COMMIT;');
      expect(sql).toContain(TARGET_OWNER_UUID);
      expect(sql).toContain(TARGET_NEW_EMAIL);
      expect(sql).toContain(TARGET_NEW_NAME);
      expect(sql).toContain(`WHERE id = '${TARGET_OWNER_UUID}'`);
      expect(sql).toContain(`AND role = '${TARGET_ROLE}'`);
      expect(sql).toContain('failed_attempts = 0');
      expect(sql).toContain('locked_until = NULL');
      expect(sql).toContain('UPDATE public.admin_auth_sessions');
      expect(sql).toContain(`WHERE user_id = '${TARGET_OWNER_UUID}'`);
      expect(sql).toContain('RAISE EXCEPTION');
      expect(sql).toContain(dummyHash);
    });
  });

  describe('executeRecovery logic and safeguards', () => {
    let mockSupabase: any;
    let mockUsers: Record<string, any>;
    let mockSessions: any[];

    beforeEach(() => {
      mockUsers = {
        [TARGET_OWNER_UUID]: {
          id: TARGET_OWNER_UUID,
          email: 'owner@circleuponline.com',
          full_name: 'Current Owner',
          role: 'owner',
          is_active: true,
          failed_attempts: 3,
          locked_until: '2026-11-25T10:00:00Z',
        },
      };
      mockSessions = [
        { id: 'session-1', user_id: TARGET_OWNER_UUID, revoked_at: null },
        { id: 'session-2', user_id: TARGET_OWNER_UUID, revoked_at: null },
      ];

      mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'admin_users') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn((col: string, val: any) => {
                const query: any = {
                  maybeSingle: vi.fn(async () => {
                    if (col === 'id') {
                      return { data: mockUsers[val] || null, error: null };
                    }
                    if (col === 'email') {
                      const found = Object.values(mockUsers).find((u) => u.email === val);
                      return { data: found || null, error: null };
                    }
                    return { data: null, error: null };
                  }),
                  neq: vi.fn((neqCol: string, neqVal: any) => ({
                    maybeSingle: vi.fn(async () => {
                      if (col === 'email') {
                        const found = Object.values(mockUsers).find(
                          (u) => u.email === val && u[neqCol] !== neqVal
                        );
                        return { data: found || null, error: null };
                      }
                      return { data: null, error: null };
                    }),
                  })),
                  single: vi.fn(async () => ({
                    data: mockUsers[val] || null,
                    error: null,
                  })),
                };
                return query;
              }),
              update: vi.fn((updateData: any) => ({
                eq: vi.fn((col1: string, val1: any) => ({
                  eq: vi.fn((col2: string, val2: any) => ({
                    select: vi.fn().mockReturnThis(),
                    single: vi.fn(async () => {
                      if (mockUsers[val1] && mockUsers[val1][col2] === val2) {
                        Object.assign(mockUsers[val1], updateData);
                        return { data: mockUsers[val1], error: null };
                      }
                      return { data: null, error: { message: 'Row not found or condition mismatch' } };
                    }),
                  })),
                })),
              })),
            };
          }
          if (table === 'admin_auth_sessions') {
            return {
              update: vi.fn((updateData: any) => ({
                eq: vi.fn((col: string, val: any) => ({
                  is: vi.fn((isCol: string, isVal: any) => {
                    mockSessions.forEach((s) => {
                      if (s.user_id === val && s[isCol] === isVal) {
                        Object.assign(s, updateData);
                      }
                    });
                    return Promise.resolve({ error: null });
                  }),
                })),
              })),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      };
    });

    it('performs dry-run verification successfully without modifying data', async () => {
      const result = await executeRecovery(mockSupabase, { dryRun: true });
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.targetUser.email).toBe('owner@circleuponline.com');
      expect(mockUsers[TARGET_OWNER_UUID].email).toBe('owner@circleuponline.com');
      expect(mockUsers[TARGET_OWNER_UUID].failed_attempts).toBe(3);
    });

    it('aborts if target owner account does not exist', async () => {
      delete mockUsers[TARGET_OWNER_UUID];
      await expect(executeRecovery(mockSupabase, { dryRun: true })).rejects.toThrow(
        `Target Owner account with UUID ${TARGET_OWNER_UUID} not found in admin_users.`
      );
    });

    it('aborts if target account exists but does not have owner role', async () => {
      mockUsers[TARGET_OWNER_UUID].role = 'staff';
      await expect(executeRecovery(mockSupabase, { dryRun: true })).rejects.toThrow(
        `Target account has role 'staff', expected 'owner'. Recovery aborted.`
      );
    });

    it('aborts if target email already belongs to another user', async () => {
      mockUsers['other-admin-uuid'] = {
        id: 'other-admin-uuid',
        email: TARGET_NEW_EMAIL,
        role: 'staff',
      };
      await expect(executeRecovery(mockSupabase, { dryRun: true })).rejects.toThrow(
        `Email conflict: '${TARGET_NEW_EMAIL}' is already assigned to admin UUID other-admin-uuid.`
      );
    });

    it('executes live update: mutates owner email, name, password_hash, clears lockout, and revokes sessions', async () => {
      const testHash = await argon2.hash('NewPassword123!', { type: argon2.argon2id });
      const result = await executeRecovery(mockSupabase, { dryRun: false, passwordHash: testHash });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(false);
      expect(result.updatedUser.email).toBe(TARGET_NEW_EMAIL);
      expect(result.updatedUser.full_name).toBe(TARGET_NEW_NAME);
      expect(result.updatedUser.password_hash).toBe(testHash);
      expect(result.updatedUser.failed_attempts).toBe(0);
      expect(result.updatedUser.locked_until).toBe(null);

      // Verify sessions revoked
      expect(mockSessions.every((s) => s.revoked_at !== null)).toBe(true);
    });
  });
});
