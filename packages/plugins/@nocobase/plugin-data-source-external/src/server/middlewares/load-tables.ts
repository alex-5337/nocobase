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

interface IntrospectedField {
  name: string;
  interface?: string;
  uiSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

interface IntrospectedCollection {
  name: string;
  fields?: IntrospectedField[];
  [key: string]: unknown;
}

export async function loadTablesAndPersist(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSources' || actionName !== 'loadTables') {
    return next();
  }

  const { dataSourceKey, tables } = ctx.action.params.values || {};

  if (!dataSourceKey || dataSourceKey === 'main') {
    return next();
  }

  const dataSource = ctx.app.dataSourceManager.dataSources.get(dataSourceKey) as DatabaseDataSource;
  if (!dataSource) {
    ctx.throw(404, `Data source "${dataSourceKey}" not found`);
  }

  const collections = await dataSource.loadTables(ctx, tables);

  await persistCollections(ctx, dataSourceKey, collections as IntrospectedCollection[]);

  ctx.body = collections;
}

async function persistCollections(ctx: Context, dataSourceKey: string, collections: IntrospectedCollection[]) {
  const collectionRepo = ctx.db.getRepository('dataSourcesCollections');
  const fieldRepo = ctx.db.getRepository('dataSourcesFields');

  await ctx.db.sequelize.transaction(async (transaction) => {
    for (const collection of collections) {
      const { fields, ...collectionOptions } = collection;

      if (!collectionOptions.filterTargetKey) {
        const pkField = (fields || []).find((f) => f.primaryKey);
        if (pkField) {
          collectionOptions.filterTargetKey = pkField.name;
        }
      }

      await collectionRepo.updateOrCreate({
        filterKeys: ['name', 'dataSourceKey'],
        values: {
          name: collection.name,
          dataSourceKey,
          options: collectionOptions,
        },
        transaction,
      });

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
          transaction,
        });
      }

      await fieldRepo.destroy({
        filter: {
          collectionName: collection.name,
          dataSourceKey,
          name: { $notIn: [...fieldNames] },
        },
        transaction,
      });
    }
  });
}
