/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import { DatabaseDataSource } from '@nocobase/data-source-manager';

/**
 * 外部数据源通过 UI 创建数据表时，默认 handler 只会在 dataSourcesCollections 中写入记录，
 * afterSaveWithAssociations 钩子也仅在内存中 defineCollection，不会在外部数据库中真正建表。
 * 此中间件在 next() 完成后（记录已持久化、内存 collection 已定义），
 * 调用 collection.sync() 将表结构同步到外部数据库。
 */
export async function createExternalCollection(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSources.collections' || actionName !== 'create') {
    return next();
  }

  const dataSourceKey = ctx.action.params.associatedIndex;
  if (!dataSourceKey || dataSourceKey === 'main') {
    return next();
  }

  // 先让默认 handler 完成记录创建（触发 afterSaveWithAssociations → defineCollection）
  await next();

  const dataSource = ctx.app.dataSourceManager.dataSources.get(dataSourceKey) as DatabaseDataSource;
  if (!dataSource) {
    return;
  }

  const collectionName = ctx.action.params.values?.name;
  if (!collectionName) {
    return;
  }

  const collection = dataSource.collectionManager.getCollection(collectionName);
  if (!collection) {
    return;
  }

  try {
    // @ts-ignore - sync 方法存在于 Sequelize Collection 上
    await collection.sync();
  } catch (error) {
    ctx.logger.error(`Failed to sync table "${collectionName}" to external database: ${error.message}`);
    ctx.throw(500, `Failed to create table in external database: ${error.message}`);
  }
}
