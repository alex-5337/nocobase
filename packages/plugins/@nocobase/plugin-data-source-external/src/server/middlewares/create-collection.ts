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

  // 通过 UI 创建外部数据源的表时，前端表单只提交 name/title/targetKey/template 等，
  // 不会带 tableName 与 filterTargetKey。而列表渲染（resourcers/data-sources-collections.ts）
  // 直接展开 collection.options，缺失这两项会导致：
  //   - filterTargetKey 为空 → CollectionTitle 显示"无主键"警告图标；
  //   - tableName 为空 → 物理表名/编辑回显异常。
  // main 数据源不依赖这两项持久化字段，故仅对外部数据源在持久化前补全：
  // 物理表名默认等于 collection name（与 sync 建表所用表名一致），主键默认取 targetKey 或 'id'。
  const values = ctx.action.params.values;
  if (values && typeof values === 'object') {
    if (!values.tableName && values.name) {
      values.tableName = values.name;
    }
    if (!values.filterTargetKey) {
      values.filterTargetKey = values.targetKey || 'id';
    }
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
