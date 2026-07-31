/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import { waitForDataSourceReady } from '../utils';

export async function waitDataSourceReady(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;

  if (resourceName === 'dataSources.collections' && actionName === 'list') {
    const dataSourceKey = ctx.action.params.associatedIndex;
    await waitForDataSourceReady(ctx.app, dataSourceKey);
  }

  return next();
}
