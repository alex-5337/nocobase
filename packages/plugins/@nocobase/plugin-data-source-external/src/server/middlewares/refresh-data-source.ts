/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import type { Application } from '@nocobase/server';
import { waitForDataSourceReady } from '../utils';

const CAN_REFRESH_STATUS = ['loaded', 'loading-failed', 'reloading-failed'];

type DataSourceManagerPlugin = {
  name: string;
  dataSourceStatus: Record<string, string>;
};

type DataSourceModelLike = {
  isMainRecord(): boolean;
  loadIntoApplication(options: { app: Application; refresh?: boolean; reuseDB?: boolean }): Promise<void>;
  get(key: string): string;
};

export async function refreshExternalDataSource(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSources' || actionName !== 'refresh') {
    return next();
  }

  const { filterByTk, clientStatus } = ctx.action.params;

  const plugin = ctx.app.pm.get('data-source-manager') as DataSourceManagerPlugin;
  const dataSourceModel = (await ctx.db.getRepository('dataSources').findOne({
    filter: { key: filterByTk },
  })) as DataSourceModelLike | null;

  if (!dataSourceModel || dataSourceModel.isMainRecord()) {
    return next();
  }

  await waitForDataSourceReady(ctx.app, filterByTk);

  const currentStatus = plugin.dataSourceStatus[filterByTk];
  if (CAN_REFRESH_STATUS.includes(currentStatus) && (clientStatus ? CAN_REFRESH_STATUS.includes(clientStatus) : true)) {
    await dataSourceModel.loadIntoApplication({
      app: ctx.app,
      refresh: true,
      reuseDB: true,
    });

    ctx.app.syncMessageManager.publish(plugin.name, {
      type: 'loadDataSource',
      dataSourceKey: dataSourceModel.get('key'),
    });
  }

  ctx.body = {
    status: plugin.dataSourceStatus[filterByTk],
  };
}
