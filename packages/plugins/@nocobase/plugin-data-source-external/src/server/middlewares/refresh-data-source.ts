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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CAN_REFRESH_STATUS = ['loaded', 'loading-failed', 'reloading-failed'];

type DataSourceModelLike = {
  isMainRecord(): boolean;
  loadIntoApplication(options: { app: Application; refresh?: boolean; reuseDB?: boolean }): Promise<void>;
  get(key: string): any;
};

/**
 * 接管外部数据源的 dataSources:refresh（不调用 next()）：
 * 原 action 不等待异步 reload 完成就以 { status: 'reloading' } 响应，
 * 客户端会把 reloading 状态写入页面状态且不再修正，表现为刷新后一直“卡在加载中”。
 * 外部数据源的 reload 很快（仅从持久化记录重建内存 collections），
 * 这里等待其完成后再响应最终状态。
 */
export async function refreshExternalDataSource(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSources' || actionName !== 'refresh') {
    return next();
  }

  const { filterByTk, clientStatus } = ctx.action.params;

  const plugin = ctx.app.pm.get('data-source-manager') as any;
  const dataSourceModel = (await ctx.db.getRepository('dataSources').findOne({
    filter: { key: filterByTk },
  })) as DataSourceModelLike | null;

  // main 数据源走原逻辑
  if (!dataSourceModel || dataSourceModel.isMainRecord()) {
    return next();
  }

  // 若正在 loading/reloading（如应用启动时的异步加载），先等待其结束（上限约 30s）
  for (let i = 0; i < 60 && ['loading', 'reloading'].includes(plugin.dataSourceStatus[filterByTk]); i++) {
    await sleep(500);
  }

  const currentStatus = plugin.dataSourceStatus[filterByTk];
  if (CAN_REFRESH_STATUS.includes(currentStatus) && (clientStatus ? CAN_REFRESH_STATUS.includes(clientStatus) : true)) {
    // 等待 reload 完成，响应携带最终状态（loaded 或 reloading-failed）
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
