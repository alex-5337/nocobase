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

const RELATION_TYPES = ['belongsTo', 'hasMany', 'hasOne', 'belongsToMany'];

export async function syncExternalField(ctx: Context, next: Next) {
  const { resourceName, actionName } = ctx.action;
  if (resourceName !== 'dataSourcesCollections.fields' || !['create', 'update', 'apply'].includes(actionName)) {
    return next();
  }

  const associatedIndex: string = ctx.action.params.associatedIndex || '';
  const [dataSourceKey, collectionName] = associatedIndex.split('.');
  if (!dataSourceKey || dataSourceKey === 'main' || !collectionName) {
    return next();
  }

  const values = ctx.action.params.values || ctx.request.body || {};
  const fieldType = values.type || values.interface;
  if (RELATION_TYPES.includes(fieldType)) {
    return next();
  }

  await next();

  const dataSource = ctx.app.dataSourceManager.dataSources.get(dataSourceKey) as DatabaseDataSource;
  if (!dataSource) {
    return;
  }

  const collection = dataSource.collectionManager.getCollection(collectionName);
  if (!collection) {
    return;
  }

  try {
    // @ts-ignore
    await collection.sync();
  } catch (error) {
    ctx.logger.error(`Failed to sync field to external table "${collectionName}": ${error.message}`);
    ctx.throw(500, `Failed to sync field to external database: ${error.message}`);
  }
}
