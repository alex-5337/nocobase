/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';

export async function ensureDialect(ctx: Context, next: Next) {
  const { actionName, resourceName, params } = ctx.action;

  if (resourceName === 'dataSources') {
    const { values } = params;
    const { type } = values || {};

    // 对于 create/update/testConnection，确保 options 中包含 dialect
    if (
      type &&
      (actionName === 'create' || actionName === 'update' || actionName === 'testConnection') &&
      !values.options?.dialect
    ) {
      ctx.action.params.values = {
        ...values,
        options: {
          ...values.options,
          dialect: type,
        },
      };
    }
  }

  await next();
}
