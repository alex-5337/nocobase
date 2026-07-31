/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';

type DataSourceManagerPlugin = {
  sendSyncMessage?(message: { type: string; dataSourceKey: string; collectionName: string }): void;
};

export async function destroyExternalCollections(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSources.collections' || actionName !== 'destroy') {
    return next();
  }

  const params = ctx.action.params;
  const { filterByTk, associatedIndex: dataSourceKey, keepTable, cascade } = params;

  const collectionNames = (Array.isArray(filterByTk) ? filterByTk : [filterByTk]).filter(Boolean);

  const dataSource = ctx.app.dataSourceManager.dataSources.get(dataSourceKey);
  if (!dataSource) {
    ctx.throw(404, `Data source "${dataSourceKey}" not found`);
  }

  const plugin = ctx.app.pm.get('data-source-manager') as DataSourceManagerPlugin;
  const shouldDropTable = keepTable !== true && keepTable !== 'true';
  const dropCascade = cascade === true || cascade === 'true';

  for (const collectionName of collectionNames) {
    const collection = dataSource.collectionManager.getCollection(collectionName);

    if (collection && shouldDropTable) {
      try {
        await collection.removeFromDb({ dropCollection: false, cascade: dropCascade });
      } catch (error) {
        ctx.logger.warn(`Failed to drop table for collection "${collectionName}": ${error.message}`);
      }
    }

    await ctx.db.sequelize.transaction(async (transaction) => {
      await ctx.db.getRepository('dataSourcesFields').destroy({
        filter: { collectionName, dataSourceKey },
        transaction,
      });

      const dataSourceCollectionRecord = await ctx.db.getRepository('dataSourcesCollections').findOne({
        filter: { name: collectionName, dataSourceKey },
        transaction,
      });

      if (dataSourceCollectionRecord) {
        await dataSourceCollectionRecord.destroy({ transaction });
      } else {
        if (collection) {
          dataSource.collectionManager.removeCollection(collectionName);
        }
        plugin.sendSyncMessage?.({
          type: 'removeDataSourceCollection',
          dataSourceKey,
          collectionName,
        });
      }
    });
  }

  ctx.body = { message: 'deleted' };
}
