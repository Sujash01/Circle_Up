import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { adminAuthService, signSessionToken, type AdminSessionData } from '../../src/services/adminAuth.service.js';
import { supabaseCatalogService } from '../../src/services/supabaseCatalog.service.js';

const app = createApp();

describe('Admin Team RBAC & Granular Permission Enforcement', () => {
  const activeSessions = new Map<string, AdminSessionData>();
  const usersDb = new Map<string, {
    id: string;
    email: string;
    name: string;
    role: 'owner' | 'staff';
    permissions: string[];
    isActive: boolean;
  }>();

  let ownerToken: string;
  let ownerCsrf: string;
  let viewOnlyStaffToken: string;
  let viewOnlyStaffCsrf: string;
  let catalogStaffToken: string;
  let catalogStaffCsrf: string;

  beforeAll(async () => {
    // Mock audit service to prevent external calls
    vi.mock('../../src/services/audit.service.js', () => ({
      auditService: { record: async () => undefined, list: async () => [] },
    }));

    // Mock catalog service operations
    vi.spyOn(supabaseCatalogService, 'listAdminProducts').mockResolvedValue({
      products: [
        {
          id: 'prod-001',
          serialNumber: 'CU-TEST-001',
          name: 'Vintage Silk Shirt',
          slug: 'vintage-silk-shirt-cu-test-001',
          price: 180000,
          stock: 1,
          category: 'tops',
          status: 'AVAILABLE',
          images: [],
          sizes: ['M'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    vi.spyOn(supabaseCatalogService, 'createProduct').mockResolvedValue({
      id: 'prod-002',
      serialNumber: 'CU-TEST-002',
      name: 'Created Thrift Item',
      slug: 'created-thrift-item-cu-test-002',
      price: 250000,
      stock: 1,
      category: 'bottoms',
      status: 'AVAILABLE',
      images: [],
      sizes: ['L'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    vi.spyOn(supabaseCatalogService, 'permanentDeleteProduct').mockResolvedValue({
      success: true,
      id: 'prod-001',
      serialNumber: 'CU-TEST-001',
    });

    // Seed database
    const owner = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'owner@circleuponline.com',
      name: 'Store Owner',
      role: 'owner' as const,
      permissions: [] as string[],
      isActive: true,
    };
    usersDb.set(owner.id, owner);

    const viewStaff = {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'viewer@circleuponline.com',
      name: 'Viewer Staff',
      role: 'staff' as const,
      permissions: ['overview:view', 'products:view'],
      isActive: true,
    };
    usersDb.set(viewStaff.id, viewStaff);

    const catalogStaff = {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'catalog@circleuponline.com',
      name: 'Catalog Staff',
      role: 'staff' as const,
      permissions: ['overview:view', 'products:view', 'products:create', 'products:edit', 'products:delete'],
      isActive: true,
    };
    usersDb.set(catalogStaff.id, catalogStaff);

    // Mock validateSession to check activeSessions and usersDb
    vi.spyOn(adminAuthService, 'validateSession').mockImplementation(async (token: string) => {
      const parsed = activeSessions.get(token);
      if (!parsed) return null;
      const user = usersDb.get(parsed.userId);
      if (!user || !user.isActive) return null;
      return {
        ...parsed,
        role: user.role,
        permissions: user.permissions,
      };
    });

    // Helper to issue tokens
    const issueSession = (user: typeof owner) => {
      const csrf = `csrf-${user.id}`;
      const sessionData: AdminSessionData = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
        csrfToken: csrf,
        expiresAt: Date.now() + 3600000,
        sessionId: `session-${user.id}`,
      };
      const token = signSessionToken(sessionData);
      activeSessions.set(token, sessionData);
      return { token, csrf };
    };

    const ownerSession = issueSession(owner);
    ownerToken = ownerSession.token;
    ownerCsrf = ownerSession.csrf;

    const viewSession = issueSession(viewStaff);
    viewOnlyStaffToken = viewSession.token;
    viewOnlyStaffCsrf = viewSession.csrf;

    const catSession = issueSession(catalogStaff);
    catalogStaffToken = catSession.token;
    catalogStaffCsrf = catSession.csrf;

    // Mock adminAuthService methods for user management
    vi.spyOn(adminAuthService, 'listAdminUsers').mockImplementation(async () => {
      return Array.from(usersDb.values()).map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        permissions: u.permissions,
        isActive: u.isActive,
      }));
    });

    vi.spyOn(adminAuthService, 'createAdminUser').mockImplementation(async (input) => {
      const id = `user-${Date.now()}`;
      const created = {
        id,
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        permissions: input.role === 'owner' ? [] : (input.permissions || []),
        isActive: true,
      };
      usersDb.set(id, created);
      return created;
    });

    vi.spyOn(adminAuthService, 'updateAdminUser').mockImplementation(async (targetId, actorId, patch) => {
      if (targetId === actorId && (patch.role !== undefined || patch.isActive === false)) {
        throw new Error('SELF_ADMIN_CHANGE_FORBIDDEN');
      }
      const target = usersDb.get(targetId);
      if (!target) throw new Error('USER_NOT_FOUND');
      if (patch.name) target.name = patch.name;
      if (patch.email) target.email = patch.email;
      if (patch.role) target.role = patch.role;
      if (patch.isActive !== undefined) target.isActive = patch.isActive;
      if (patch.permissions) target.permissions = patch.permissions;

      // Revoke sessions if deactivated
      if (patch.isActive === false) {
        for (const [token, session] of activeSessions.entries()) {
          if (session.userId === targetId) {
            activeSessions.delete(token);
          }
        }
      }
      return { ...target };
    });

    vi.spyOn(adminAuthService, 'deleteAdminUser').mockImplementation(async (targetId, actorId) => {
      if (targetId === actorId) {
        const err = new Error('You cannot delete your own account.');
        (err as any).code = 'SELF_ADMIN_CHANGE_FORBIDDEN';
        throw err;
      }
      const target = usersDb.get(targetId);
      if (!target) {
        const err = new Error('Admin user not found.');
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
      if (target.role === 'owner') {
        const err = new Error('Owner accounts cannot be deleted.');
        (err as any).code = 'CANNOT_DELETE_OWNER';
        throw err;
      }
      usersDb.delete(targetId);
      for (const [token, session] of activeSessions.entries()) {
        if (session.userId === targetId) activeSessions.delete(token);
      }
      return { success: true, deletedId: targetId };
    });
  });

  describe('User Management Access Control', () => {
    it('allows owner to list team users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('denies staff member access to /api/admin/users with 403 FORBIDDEN_ROLE', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${viewOnlyStaffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('allows owner to create staff user with assigned permissions', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-CSRF-Token', ownerCsrf)
        .send({
          name: 'New Helper',
          email: 'helper@circleuponline.com',
          password: 'Password123!',
          role: 'staff',
          permissions: ['products:view', 'inquiries:view'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('New Helper');
      expect(res.body.data.permissions).toEqual(['products:view', 'inquiries:view']);
    });
  });

  describe('Granular Permission Checks on Catalog Endpoints', () => {
    it('allows staff with products:view to browse products', async () => {
      const res = await request(app)
        .get('/api/admin/products')
        .set('Authorization', `Bearer ${viewOnlyStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('denies staff WITHOUT products:create from creating a product with 403 FORBIDDEN_PERMISSION', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${viewOnlyStaffToken}`)
        .set('X-CSRF-Token', viewOnlyStaffCsrf)
        .send({
          name: 'Unauthorized Product',
          price: 150000,
          category: 'tops',
          stock: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
      expect(res.body.error.message).toContain('products:create');
    });

    it('allows staff WITH products:create to create a product', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${catalogStaffToken}`)
        .set('X-CSRF-Token', catalogStaffCsrf)
        .send({
          name: 'Authorized Product',
          price: 250000,
          category: 'bottoms',
          stock: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Created Thrift Item');
    });

    it('denies staff WITHOUT products:delete from permanently deleting a product with 403 FORBIDDEN_PERMISSION', async () => {
      const res = await request(app)
        .delete('/api/admin/products/CU-TEST-001/permanent')
        .set('Authorization', `Bearer ${viewOnlyStaffToken}`)
        .set('X-CSRF-Token', viewOnlyStaffCsrf);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
      expect(res.body.error.message).toContain('products:delete');
    });

    it('allows staff WITH products:delete to permanently delete an unordered product', async () => {
      const res = await request(app)
        .delete('/api/admin/products/CU-TEST-001/permanent')
        .set('Authorization', `Bearer ${catalogStaffToken}`)
        .set('X-CSRF-Token', catalogStaffCsrf);

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });
  });

  describe('Session Invalidation and Owner Protection', () => {
    it('immediately rejects requests from deactivated staff member (401 INVALID_SESSION)', async () => {
      // Deactivate viewer staff
      await request(app)
        .patch('/api/admin/users/22222222-2222-2222-2222-222222222222')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-CSRF-Token', ownerCsrf)
        .send({ isActive: false });

      // Immediate subsequent call using viewOnlyStaffToken
      const res = await request(app)
        .get('/api/admin/products')
        .set('Authorization', `Bearer ${viewOnlyStaffToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_SESSION');
    });
  });
});
