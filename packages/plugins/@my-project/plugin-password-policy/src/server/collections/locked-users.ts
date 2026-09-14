/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';
import { lockedUsersCollectionName } from '../../shared/constants';

export default defineCollection({
  name: lockedUsersCollectionName,
  dataCategory: 'business',
  migrationRules: ['schema-only'],
  createdAt: true,
  updatedAt: true,
  indexes: [{ unique: true, fields: ['userId'] }],
  fields: [
    { type: 'bigInt', name: 'userId', allowNull: false },
    { type: 'string', name: 'username' },
    { type: 'string', name: 'nickname' },
    { type: 'string', name: 'email' },
    { type: 'bigInt', name: 'failedAttempts', allowNull: false, defaultValue: 0 },
    { type: 'bigInt', name: 'windowStartAt', allowNull: false, defaultValue: 0 },
    { type: 'bigInt', name: 'lastFailedAt', allowNull: false, defaultValue: 0 },
    // Unix timestamp in milliseconds when the automatic lock expires; 0 means locked until unlocked by an administrator.
    { type: 'bigInt', name: 'lockedUntil' },
    { type: 'boolean', name: 'locked', defaultValue: false },
    // Records added manually by an administrator stay locked until the record is deleted.
    { type: 'boolean', name: 'manualLock', defaultValue: false },
  ],
});
