/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import { Cache } from '@nocobase/cache';
import { Model } from '@nocobase/database';
import { Plugin } from '@nocobase/server';
import { namespace } from '../constants';
import {
  defaultPasswordPolicyConfig,
  LOCKED_USER_CACHE_TTL_MS,
  lockedUsersCollectionName,
  LockedUserRecord,
  passwordComplexityActions,
  passwordPolicyCollectionName,
  passwordPolicyRecordKey,
  PasswordPolicyConfig,
} from '../shared/constants';
import { checkPasswordComplexity } from '../shared/password-checker';

type UserLike = { get?(key: string): unknown } & Record<string, unknown>;

export class PluginPasswordPolicyServer extends Plugin {
  private policyConfig: PasswordPolicyConfig = { ...defaultPasswordPolicyConfig };
  private cache: Cache;

  async load() {
    this.cache = await this.app.cacheManager.createCache({
      name: 'password-policy',
      prefix: 'password-policy',
      store: 'memory',
    });
    this.app.on('afterLoad', async () => {
      await this.loadConfig();
    });
    this.registerDbHooks();
    this.registerAcl();
    this.app.resourceManager.use(async (ctx: Context, next: Next) => this.middleware(ctx, next), {
      tag: 'password-policy',
      after: 'acl',
    });
  }

  async install() {
    const repo = this.app.db.getRepository(passwordPolicyCollectionName);
    const exist = await repo.findOne({ filterByTk: passwordPolicyRecordKey });
    if (exist) {
      return;
    }
    await repo.create({ values: { key: passwordPolicyRecordKey, config: defaultPasswordPolicyConfig } });
  }

  private async loadConfig() {
    try {
      const record = await this.app.db
        .getRepository(passwordPolicyCollectionName)
        .findOne({ filterByTk: passwordPolicyRecordKey });
      const config = record?.get?.('config') as Partial<PasswordPolicyConfig> | undefined;
      if (config) {
        this.policyConfig = { ...defaultPasswordPolicyConfig, ...config };
      }
    } catch (error) {
      this.app.logger.warn(`password-policy: failed to load config, fallback to defaults: ${toMessage(error)}`);
    }
  }

  private registerDbHooks() {
    this.app.db.on(`${passwordPolicyCollectionName}.afterSave`, async (model: Model) => {
      this.policyConfig = {
        ...defaultPasswordPolicyConfig,
        ...((model.get('config') || {}) as Partial<PasswordPolicyConfig>),
      };
    });
    const invalidate = async (model: Model) => {
      await this.cache.del(`locked:${model.get('userId')}`);
    };
    this.app.db.on(`${lockedUsersCollectionName}.afterSave`, invalidate);
    this.app.db.on(`${lockedUsersCollectionName}.afterDestroy`, invalidate);
  }

  private registerAcl() {
    // Admin roles own the `pm.*` snippets by default, so registering the snippet is enough to
    // grant the settings pages read/write access to these two collections.
    this.app.acl.registerSnippet({
      name: 'pm.security.password-policy',
      actions: [`${passwordPolicyCollectionName}:*`, `${lockedUsersCollectionName}:*`],
    });
  }

  private async middleware(ctx: Context, next: Next) {
    const { resourceName, actionName } = ctx.action;
    if (resourceName === 'auth' && actionName === 'signIn') {
      await this.handleSignIn(ctx, next);
      return;
    }
    const user = ctx.state?.currentUser as UserLike | undefined;
    const userId = Number(this.pick(user, 'id')) || 0;
    if (userId && (await this.isUserLocked(userId))) {
      ctx.throw(401, ctx.t('Your account has been locked, please contact the administrator', { ns: namespace }));
    }
    if (passwordComplexityActions.has(`${resourceName}:${actionName}`)) {
      this.assertPasswordComplexity(ctx, user);
    }
    await next();
  }

  private async handleSignIn(ctx: Context, next: Next) {
    const values = (ctx.action.params.values || {}) as Record<string, unknown>;
    const account = values.account as string;
    const email = values.email as string;
    let attemptedUserId = 0;
    if (account || email) {
      const user = await this.app.db.getRepository('users').findOne({
        filter: account ? { $or: [{ username: account }, { email: account }] } : { email },
      });
      attemptedUserId = Number(this.pick(user, 'id')) || 0;
    }
    if (attemptedUserId) {
      await this.assertNotLocked(attemptedUserId, ctx);
    }
    try {
      await next();
    } catch (err) {
      const e = err as { internalCode?: string; user?: UserLike };
      if (e?.internalCode === 'INCORRECT_PASSWORD' && e?.user) {
        const remaining = await this.recordFailedAttempt(e.user);
        if (remaining !== null) {
          // Replace the generic "incorrect password" error with one that reports how many attempts are
          // left, and report the lockout immediately on the attempt that reaches the threshold.
          ctx.throw(
            401,
            remaining > 0
              ? ctx.t(
                  'The username/email or password is incorrect, please re-enter. You have {{n}} attempts remaining',
                  {
                    ns: namespace,
                    n: remaining,
                  },
                )
              : ctx.t('The account has been locked due to too many failed sign-in attempts, please try again later', {
                  ns: namespace,
                }),
          );
        }
      }
      throw err;
    }
    if (attemptedUserId) {
      await this.clearFailedAttempts(attemptedUserId);
    }
  }

  private async assertNotLocked(userId: number, ctx: Context) {
    const record = await this.getLockRecord(userId);
    if (!this.isLockedRecord(record)) {
      return;
    }
    const message = record.manualLock
      ? ctx.t('The account has been locked by the administrator, please contact the administrator to unlock it', {
          ns: namespace,
        })
      : ctx.t('The account has been locked due to too many failed sign-in attempts, please try again later', {
          ns: namespace,
        });
    ctx.throw(401, message);
  }

  private async getLockRecord(userId: number): Promise<LockedUserRecord | null> {
    const model = await this.app.db.getRepository(lockedUsersCollectionName).findOne({ filter: { userId } });
    return model ? (model.toJSON() as LockedUserRecord) : null;
  }

  private isLockedRecord(record: LockedUserRecord | null): boolean {
    if (!record?.locked) {
      return false;
    }
    if (record.manualLock) {
      return true;
    }
    const lockedUntil = Number(record.lockedUntil) || 0;
    return lockedUntil === 0 || lockedUntil > Date.now();
  }

  private async isUserLocked(userId: number): Promise<boolean> {
    const record = await this.cache.wrap(
      `locked:${userId}`,
      async () => {
        const value = await this.getLockRecord(userId);
        // cache-manager does not cache null/undefined values, so unlocked users are cached as a sentinel object
        return value || ({ locked: false, manualLock: false, userId } as LockedUserRecord);
      },
      LOCKED_USER_CACHE_TTL_MS,
    );
    return this.isLockedRecord(record as LockedUserRecord);
  }

  // Returns the number of sign-in attempts left for the user, or null when the lockout is disabled.
  private async recordFailedAttempt(user: UserLike): Promise<number | null> {
    try {
      const max = Number(this.policyConfig.maxFailedAttempts) || 0;
      if (!max) {
        return null;
      }
      const userId = Number(this.pick(user, 'id')) || 0;
      if (!userId) {
        return null;
      }
      const repo = this.app.db.getRepository(lockedUsersCollectionName);
      const record = await this.getLockRecord(userId);
      const now = Date.now();
      if (this.isLockedRecord(record)) {
        return 0;
      }
      const windowMs = (Number(this.policyConfig.failedAttemptWindow) || 0) * 1000;
      // An expired lock restarts the counter instead of accumulating on top of the previous round.
      const lockExpired = !!record?.locked && !record.manualLock;
      const inWindow =
        !lockExpired &&
        !!record &&
        windowMs > 0 &&
        Number(record.windowStartAt) > 0 &&
        now - Number(record.windowStartAt) < windowMs;
      const failedAttempts = inWindow && record ? (Number(record.failedAttempts) || 0) + 1 : 1;
      const values: Partial<LockedUserRecord> = {
        userId,
        username: this.pick(user, 'username') as string,
        nickname: this.pick(user, 'nickname') as string,
        email: this.pick(user, 'email') as string,
        failedAttempts,
        windowStartAt: inWindow && record ? Number(record.windowStartAt) : now,
        lastFailedAt: now,
        locked: false,
        manualLock: false,
        lockedUntil: 0,
      };
      if (failedAttempts >= max) {
        const lockDurationMs = (Number(this.policyConfig.lockDuration) || 0) * 1000;
        values.locked = true;
        values.lockedUntil = lockDurationMs > 0 ? now + lockDurationMs : 0;
      }
      if (record) {
        await repo.update({ filter: { userId }, values });
      } else {
        await repo.create({ values });
      }
      await this.cache.del(`locked:${userId}`);
      return Math.max(max - failedAttempts, 0);
    } catch (error) {
      this.app.logger.warn(`password-policy: failed to record sign-in failure: ${toMessage(error)}`);
      return null;
    }
  }

  private async clearFailedAttempts(userId: number) {
    try {
      const record = await this.getLockRecord(userId);
      if (record && !record.manualLock) {
        await this.app.db.getRepository(lockedUsersCollectionName).destroy({ filter: { userId } });
        await this.cache.del(`locked:${userId}`);
      }
    } catch (error) {
      this.app.logger.warn(`password-policy: failed to clear sign-in failures: ${toMessage(error)}`);
    }
  }

  private assertPasswordComplexity(ctx: Context, currentUser?: UserLike) {
    const values = (ctx.action.params.values || {}) as Record<string, unknown>;
    const password = values.password ?? values.newPassword;
    if (!password || typeof password !== 'string') {
      return;
    }
    const { resourceName, actionName } = ctx.action;
    let username = values.username as string | undefined;
    if (!username && resourceName === 'auth' && actionName === 'changePassword') {
      username = this.pick(currentUser, 'username') as string;
    }
    const error = checkPasswordComplexity(password, this.policyConfig, username);
    if (error) {
      ctx.throw(400, ctx.t(error.key, { ns: namespace, ...(error.params || {}) }));
    }
  }

  private pick(user: UserLike | null | undefined, key: string): unknown {
    if (!user) {
      return undefined;
    }
    return typeof user.get === 'function' ? user.get(key) : user[key];
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default PluginPasswordPolicyServer;
