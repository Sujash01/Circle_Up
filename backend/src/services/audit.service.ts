import type { Request } from 'express';
import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import type { AdminSessionData } from './adminAuth.service.js';
import type { ClientSession } from 'mongoose';
import { ServiceUnavailableError } from '../errors/AppError.js';

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
    if (mongoose.connection.readyState !== 1) {
      throw new ServiceUnavailableError('Audit storage is temporarily unavailable.', 'AUDIT_UNAVAILABLE');
    }
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
  },

  async record(params: {
    actor?: AdminSessionData;
    action: string;
    entity: string;
    entityId: string;
    diff?: Record<string, unknown>;
    req?: Request;
  }): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;

    try {
      const ipAddress =
        params.req?.ip ||
        (params.req?.headers['x-forwarded-for'] as string) ||
        '127.0.0.1';
      const userAgent = params.req?.headers['user-agent'] || 'CircleUp Admin';

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
      // Non-blocking: audit log failure should not fail mutation
    }
  },

  async list(limit = 50) {
    if (mongoose.connection.readyState !== 1) return [];
    return AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
  },
};

