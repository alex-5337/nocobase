/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';

/**
 * 接管外部数据源 collections 的 dataSources.collections:destroy（不调用 next()）：
 * 原实现把 filterByTk 当单个 collection 名处理，批量删除传入数组时
 * getCollection 查不到、DB 记录也匹配不上，会静默什么都不删；
 * 同时原实现忽略了 cascade 参数。这里统一按数组逐个处理。
 */
export async function destroyExternalCollections(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSources.collections' || actionName !== 'destroy') {
    return next();
  }

  const params = ctx.action.params;
  const { filterByTk, associatedIndex: dataSourceKey, keepTable, cascade } = params;

  // 批量删除时 filterByTk 是数组，统一按数组处理
  const collectionNames = (Array.isArray(filterByTk) ? filterByTk : [filterByTk]).filter(Boolean);

  const dataSource = ctx.app.dataSourceManager.dataSources.get(dataSourceKey);
  if (!dataSource) {
    ctx.throw(404, `Data source "${dataSourceKey}" not found`);
  }

  const plugin = ctx.app.pm.get('data-source-manager') as any;
  const shouldDropTable = keepTable !== true && keepTable !== 'true';
  const dropCascade = cascade === true || cascade === 'true';

  for (const collectionName of collectionNames) {
    // Check if collection exists in the in-memory data source
    const collection = dataSource.collectionManager.getCollection(collectionName);

    // If not keeping the table, drop the underlying table in the external data source
    if (collection && shouldDropTable) {
      try {
        await collection.removeFromDb({ dropCollection: false, cascade: dropCascade });
      } catch (error) {
        ctx.logger.warn(`Failed to drop table for collection "${collectionName}": ${error.message}`);
      }
    }

    // 级联删除该 collection 的字段记录。manager 的 dataSourcesCollections.afterDestroy
    // 钩子不会级联删 fields，若不在此删除，collections 记录删除后 fields 会成为孤儿，
    // 重启时 loadLocalData 会用孤儿字段造出无 title/tableName/filterTargetKey 的空壳
    // collection（列表上的"幽灵行"），且因没有 collections 记录，UI 删除也清不掉。
    // 放在 if/else 之外，使"有 collections 记录"和"仅残留 fields 的幽灵行"两种情况都能清理。
    // 内存与集群同步由下方 removeCollection / removeDataSourceCollection 兜底。
    await ctx.db.getRepository('dataSourcesFields').destroy({
      filter: { collectionName, dataSourceKey },
    });

    // Delete the database record if it exists
    const dataSourceCollectionRecord = await ctx.db.getRepository('dataSourcesCollections').findOne({
      filter: {
        name: collectionName,
        dataSourceKey,
      },
    });

    if (dataSourceCollectionRecord) {
      // dataSourcesCollections.afterDestroy hook 会负责内存清理和集群同步
      await dataSourceCollectionRecord.destroy();
    } else {
      // Even without a DB record, cleanup from memory and notify other instances
      if (collection) {
        dataSource.collectionManager.removeCollection(collectionName);
      }

      if (plugin?.sendSyncMessage) {
        plugin.sendSyncMessage({
          type: 'removeDataSourceCollection',
          dataSourceKey,
          collectionName,
        });
      }
    }
  }

  ctx.body = { message: 'deleted' };
}
