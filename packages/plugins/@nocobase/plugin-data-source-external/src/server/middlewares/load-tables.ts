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
 * 接管外部数据源的 dataSources:loadTables（不调用 next()）：
 * 1. 原 action 没有设置 ctx.body，导致响应 404；
 * 2. 加载到的 collections 需要持久化到 dataSourcesCollections / dataSourcesFields，
 *    否则刷新或重启后丢失。
 */
export async function loadTablesAndPersist(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSources' || actionName !== 'loadTables') {
    return next();
  }

  const { dataSourceKey, tables } = ctx.action.params.values || {};

  // main 数据源走原逻辑
  if (!dataSourceKey || dataSourceKey === 'main') {
    return next();
  }

  const dataSource = ctx.app.dataSourceManager.dataSources.get(dataSourceKey) as DatabaseDataSource;
  if (!dataSource) {
    ctx.throw(404, `Data source "${dataSourceKey}" not found`);
  }

  // 调用 ExternalDataSource.loadTables() 内省并在内存中定义 collections
  const collections = await dataSource.loadTables(ctx, tables);

  // 持久化到 dataSourcesCollections / dataSourcesFields
  await persistCollections(ctx, dataSourceKey, collections);

  ctx.body = collections;
}

/**
 * 将内省得到的 collections 及其 fields 持久化到数据库，
 * 与 main 数据源的 syncFieldsFromDatabase 行为保持一致：
 * - updateOrCreate collection 和 field 记录
 * - 清理数据库中已不存在的过期字段
 */
async function persistCollections(ctx: Context, dataSourceKey: string, collections: any[]) {
  const collectionRepo = ctx.db.getRepository('dataSourcesCollections');
  const fieldRepo = ctx.db.getRepository('dataSourcesFields');

  for (const collection of collections) {
    const { fields, ...collectionOptions } = collection;

    // 持久化 collection 记录
    await collectionRepo.updateOrCreate({
      filterKeys: ['name', 'dataSourceKey'],
      values: {
        name: collection.name,
        dataSourceKey,
        options: collectionOptions,
      },
    });

    // 持久化 fields
    const fieldNames = new Set<string>();
    for (const field of fields || []) {
      fieldNames.add(field.name);
      await fieldRepo.updateOrCreate({
        filterKeys: ['name', 'collectionName', 'dataSourceKey'],
        values: {
          name: field.name,
          collectionName: collection.name,
          dataSourceKey,
          interface: field.interface,
          uiSchema: field.uiSchema,
          options: field,
        },
      });
    }

    // 清理过期字段（数据库中已删除但 dataSourcesFields 中仍存在的）
    const existingFields = await fieldRepo.find({
      filter: {
        collectionName: collection.name,
        dataSourceKey,
      },
    });

    for (const existingField of existingFields) {
      if (!fieldNames.has(existingField.name)) {
        await fieldRepo.destroy({
          filterByTk: existingField.key,
        });
      }
    }
  }
}
