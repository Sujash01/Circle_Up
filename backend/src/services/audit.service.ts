import type { Request } from 'express';
import type { AdminSessionData } from './adminAuth.service.js';
import { ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseAdminClient } from './supabase.service.js';

const SENSITIVE_METADATA_KEY = /password|token|secret|authorization|cookie|session|csrf|service.?role|api.?key|customer|email|phone|mobile|address|contact|full.?name|^name$/i;
const SENSITIVE_STRING_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
];

function sanitizeMetadata(value: unknown): unknown {
  if (typeof value === 'string') {
    return SENSITIVE_STRING_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, '[REDACTED]'), value);
  }
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_METADATA_KEY.test(key) ? '[REDACTED]' : sanitizeMetadata(nested),
    ]));
  }
  return value;
}

function unavailable(): ServiceUnavailableError {
  return new ServiceUnavailableError('Audit storage is temporarily unavailable.', 'AUDIT_UNAVAILABLE');
}

function throwOnDatabaseError(error: unknown): void {
  if (error) throw unavailable();
}

function serializeAuditRow(params: {
  actor?: AdminSessionData;
  action: string;
  entity: string;
  entityId: string;
  diff?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
}) {
  return {
    actor_id: params.actor?.userId || 'system',
    actor_email: params.actor?.email || 'system@circleuponline.com',
    actor_role: params.actor?.role || 'system',
    table_name: params.entity,
    record_id: params.entityId,
    action: params.action,
    after_state: params.diff ? sanitizeMetadata(params.diff) : null,
    ip_address: params.ipAddress,
    user_agent: params.userAgent.slice(0, 1024),
  };
}

export const auditService = {
  async recordRequired(
    params: {
      actor: AdminSessionData;
      action: string;
      entity: string;
      entityId: string;
      diff?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    try {
      const { error } = await getSupabaseAdminClient().from('activity_audit_logs').insert(serializeAuditRow({
        ...params,
        ipAddress: params.ipAddress || '127.0.0.1',
        userAgent: params.userAgent || 'CircleUp Admin',
      }));
      throwOnDatabaseError(error);
    } catch (error) {
      if (error instanceof ServiceUnavailableError && error.code === 'AUDIT_UNAVAILABLE') throw error;
      throw unavailable();
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
    const forwarded = params.req?.headers['x-forwarded-for'];
    const ipAddress = params.req?.ip || (Array.isArray(forwarded) ? forwarded[0] : forwarded) || '127.0.0.1';
    const userAgent = params.req?.headers['user-agent'] || 'CircleUp Admin';

    try {
      const { error } = await getSupabaseAdminClient().from('activity_audit_logs').insert(serializeAuditRow({
        ...params,
        ipAddress,
        userAgent: Array.isArray(userAgent) ? userAgent[0] || 'CircleUp Admin' : userAgent,
      }));
      throwOnDatabaseError(error);
    } catch {
      // Best-effort audit records do not block their originating operation.
    }
  },

  async list(limit = 50) {
    try {
      const { data, error } = await getSupabaseAdminClient()
        .from('activity_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      throwOnDatabaseError(error);
      return (data || []).map((log: Record<string, unknown>) => ({
        id: log.id,
        actorId: log.actor_id,
        actorEmail: log.actor_email || log.actor_id || 'system',
        actorRole: log.actor_role || 'system',
        action: log.action,
        entity: log.table_name || 'System',
        entityId: log.record_id || '',
        diff: sanitizeMetadata(log.after_state || log.diff || log.before_state || {}),
        ipAddress: log.ip_address,
        userAgent: log.user_agent,
        createdAt: log.created_at,
      }));
    } catch {
      throw unavailable();
    }
  },
};
