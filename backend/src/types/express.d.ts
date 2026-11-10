import type { ActorType, AdminPermission, Role } from '@circleup/shared';

export interface AuthContext {
  id: string;
  actorType: ActorType;
  role: Role;
  permissions: AdminPermission[];
  tokenVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
    }
  }
}

export {};

