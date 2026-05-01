// src/app/shared/models/user.model.ts

export type UserRole = 'ADMIN' | 'WORKER' | 'MONITORING';

export interface User {
  id:        string;
  username:  string;
  role:      UserRole;
  createdAt: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user:         User;
}

// Role ruxsatlari
export const ROLE_PERMISSIONS: Record<UserRole, {
  canAdd:    boolean;
  canEdit:   boolean;
  canDelete: boolean;
  canScan:   boolean;
  canManageUsers: boolean;
}> = {
  ADMIN: {
    canAdd:         true,
    canEdit:        true,
    canDelete:      true,
    canScan:        true,
    canManageUsers: true,
  },
  WORKER: {
    canAdd:         true,
    canEdit:        true,
    canDelete:      false,
    canScan:        true,
    canManageUsers: false,
  },
  MONITORING: {
    canAdd:         false,
    canEdit:        false,
    canDelete:      false,
    canScan:        false,
    canManageUsers: false,
  },
};
