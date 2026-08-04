/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'publicPages',
  title: 'Public Pages',
  filterTargetKey: 'id',
  fields: [
    { type: 'string', name: 'slug', allowNull: false, unique: true },
    { type: 'string', name: 'title' },
    // 'html' | 'react'
    { type: 'string', name: 'format', defaultValue: 'html' },
    { type: 'text', name: 'content', length: 'long' },
    { type: 'boolean', name: 'published', defaultValue: false },
  ],
});
