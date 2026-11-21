import type { Request } from 'express';
import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import type { AdminSessionData } from './adminAuth.service.js';
import type { ClientSession } from 'mongoose';
import { ServiceUnavailableError } from '../errors/AppError.js';
import { isSupabaseConfigured, getSupabaseAdminClient } from './supabase.service.js';

export const auditService = {
  async recordRequired(params: {
    actor: AdminSessionData;
    action: string;
    entity: string;
    entityId: string;
    diff?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }, session: ClientSession): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        await client.from('activity_audit_logs').insert([
          {
            actor_id: params.actor.userId,
            actor_email: params.actor.email,
            actor_role: params.actor.role,
            table_name: params.entity,
            record_id: params.entityId,
            action: params.action,
            after_state: params.diff || null,
            ip_address: params.ipAddress || '127.0.0.1',
            user_agent: params.userAgent || 'CircleUp Admin',
          },
        ]);
      } catch {
        // Continue
      }
    }

    if (mongoose.connection.readyState === 1) {
      await AuditLog.create([{
        actorId: params.actor.userId,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        diff: params.diff,
        ipAddress: params.ipAddress || '127.0.0.1',
        userAgent: params.userAgent || 'CircleUp Admin',
      }], { session });
      return;
    }

    if (!isSupabaseConfigured()) {
      throw new ServiceUnavailableError('Audit storage is temporarily unavailable.', 'AUDIT_UNAVAILABLE');
    }
  },

  async record(params: {
    actor?: AdminSessionData;
    action: string;
    entity: string;
    entityId: string;
    diff?: Record<string, unknown>;
    req?: Request;
  }): Promise<void> {
    const ipAddress =
      params.req?.ip ||
      (params.req?.headers['x-forwarded-for'] as string) ||
      '127.0.0.1';
    const userAgent = params.req?.headers['user-agent'] || 'CircleUp Admin';

    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        await client.from('activity_audit_logs').insert([
          {
            actor_id: params.actor?.userId || 'system',
            actor_email: params.actor?.email || 'system@circleuponline.com',
            actor_role: params.actor?.role || 'system',
            table_name: params.entity,
            record_id: params.entityId,
            action: params.action,
            after_state: params.diff || null,
            ip_address: ipAddress,
            user_agent: userAgent,
          },
        ]);
      } catch {
        // Non-blocking
      }
    }

    if (mongoose.connection.readyState === 1) {
      try {
        await AuditLog.create({
          actorId: params.actor?.userId || 'system',
          actorEmail: params.actor?.email || 'system@circleuponline.com',
          actorRole: params.actor?.role || 'system',
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          diff: params.diff,
          ipAddress,
          userAgent,
        });
      } catch {
        // Non-blocking
      }
    }
  },

  async list(limit = 50) {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseAdminClient();
        const { data, error } = await client
          .from('activity_audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && Array.isArray(data)) {
          return data.map((log: any) => ({
            id: log.id,
            actorId: log.actor_id,
            actorEmail: log.actor_email || log.actor_id || 'system',
            actorRole: log.actor_role || 'staff',
            action: log.action,
            entity: log.table_name || 'System',
            entityId: log.record_id || '',
            diff: log.after_state || log.before_state || {},
            ipAddress: log.ip_address,
            userAgent: log.user_agent,
            createdAt: log.created_at,
          }));
        }
      } catch {
        // Fall back
      }
    }

    if (mongoose.connection.readyState !== 1) return [];
    return AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
  },
};

