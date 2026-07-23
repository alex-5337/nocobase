/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 外部数据源的刷新（reload）在服务端是异步执行的，loading/reloading 期间
 * dataSources.collections:list 会直接抛错，页面表现为“卡在加载中”且列表为空。
 * 这里在列表请求进入时挂起等待数据源就绪（上限约 30s），就绪后再放行。
 */
export async function waitDataSourceReady(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;

  if (resourceName === 'dataSources.collections' && actionName === 'list') {
    const plugin = ctx.app.pm.get('data-source-manager') as any;
    const dataSourceKey = ctx.action.params.associatedIndex;

    for (let i = 0; i < 60; i++) {
      const status = plugin?.dataSourceStatus?.[dataSourceKey];
      if (!['loading', 'reloading'].includes(status)) {
        break;
      }
      await sleep(500);
    }
  }

  return next();
}
