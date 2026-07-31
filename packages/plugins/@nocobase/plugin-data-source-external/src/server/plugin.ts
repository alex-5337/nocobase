/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { ExternalDataSource } from './data-sources/external-data-source';
import { ensureDialect } from './middlewares/ensure-dialect';
import { loadTablesAndPersist } from './middlewares/load-tables';
import { destroyExternalCollections } from './middlewares/destroy-collections';
import { waitDataSourceReady } from './middlewares/wait-data-source-ready';
import { refreshExternalDataSource } from './middlewares/refresh-data-source';
import { createExternalCollection } from './middlewares/create-collection';
import { ensureFieldTargetKey } from './middlewares/ensure-field-target-key';
import { syncExternalField } from './middlewares/sync-field';

export class PluginDataSourceExternalServer extends Plugin {
  async beforeLoad() {
    this.app.dataSourceManager.factory.register('postgres', ExternalDataSource);
    this.app.dataSourceManager.factory.register('mysql', ExternalDataSource);
  }

  async load() {
    this.app.acl.registerSnippet({
      name: 'pm.data-source-manager.external',
      actions: ['dataSources:*'],
    });

    this.app.resourcer.use(ensureDialect, { tag: 'ensure-dialect', before: 'default' });
    // 为外部数据源的 belongsTo 字段添加默认的 targetKey
    this.app.resourcer.use(ensureFieldTargetKey, { tag: 'ensure-field-target-key', before: 'default' });
    // 以下中间件会接管外部数据源的相关请求，注册在 acl 之后以确保权限校验已执行
    this.app.resourcer.use(waitDataSourceReady, { tag: 'external-wait-data-source-ready', after: 'acl' });
    this.app.resourcer.use(refreshExternalDataSource, { tag: 'external-refresh-data-source', after: 'acl' });
    this.app.resourcer.use(loadTablesAndPersist, { tag: 'external-load-tables', after: 'acl' });
    this.app.resourcer.use(destroyExternalCollections, { tag: 'external-destroy-collections', after: 'acl' });
    this.app.resourcer.use(createExternalCollection, { tag: 'external-create-collection', after: 'acl' });
    this.app.resourcer.use(syncExternalField, { tag: 'external-sync-field', after: 'acl' });
  }
}

export default PluginDataSourceExternalServer;
