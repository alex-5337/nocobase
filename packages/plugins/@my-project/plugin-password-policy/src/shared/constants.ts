/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export const passwordPolicyRecordKey = 'password-policy-config';
export const passwordPolicyCollectionName = 'passwordPolicyConfig';
export const lockedUsersCollectionName = 'lockedUsers';

// TTL (milliseconds) of the per-user lock record cache used for blocking already locked users on every request.
export const LOCKED_USER_CACHE_TTL_MS = 15000;

// 0 = no restriction; 1 = letters + digits; 2 = letters + digits + symbols; 3 = digits + upper + lower;
// 4 = digits + upper + lower + symbols; 5 = at least 3 of the 4 kinds.
export type PasswordComplexityRule = 0 | 1 | 2 | 3 | 4 | 5;

export interface PasswordPolicyConfig {
  minPasswordLength: number;
  passwordComplexity: PasswordComplexityRule;
  cantIncludeUsername: boolean;
  maxFailedAttempts: number;
  failedAttemptWindow: number; // seconds, the counting window of consecutive failed sign-in attempts
  lockDuration: number; // seconds, 0 = locked until an administrator unlocks the account
}

export const defaultPasswordPolicyConfig: PasswordPolicyConfig = {
  minPasswordLength: 8,
  passwordComplexity: 0,
  cantIncludeUsername: false,
  maxFailedAttempts: 0,
  failedAttemptWindow: 300,
  lockDuration: 0,
};

export interface LockedUserRecord {
  id?: number;
  userId: number;
  username?: string;
  nickname?: string;
  email?: string;
  failedAttempts?: number;
  windowStartAt?: number;
  lastFailedAt?: number;
  locked?: boolean;
  manualLock?: boolean;
  lockedUntil?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Resourcer actions whose `values` may carry a password that must pass the complexity rules.
// `auth:changePassword` uses `newPassword` while all the other actions use `password`.
export const passwordComplexityActions = new Set<string>([
  'users:create',
  'users:update',
  'users:updateProfile',
  'auth:signUp',
  'auth:resetPassword',
  'auth:changePassword',
]);
