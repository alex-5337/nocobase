/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import { ExternalDataSourceSettingsForm } from './settings/ExternalDataSourceSettingsForm';
import { CollectionsSyncAction } from './components/CollectionsSyncAction';
import { ExternalDeleteCollection } from './components/ExternalDeleteCollection';
import { collectionTableSchema } from '@nocobase/plugin-data-source-manager/src/client/component/CollectionsManager/schema/collections';

const EXTERNAL_TYPES = ['postgres', 'mysql'];

/**
 * 向 plugin-data-source-manager 的 collectionTableSchema ActionBar 中
 * 注入「从数据库同步」按钮，仅对外部数据源类型可见。
 * 这样无需修改 plugin-data-source-manager 的源码。
 */
function injectSyncActionIntoSchema() {
  const props = collectionTableSchema.properties as Record<string, any>;
  if (!props) return;
  const actionBarKey = Object.keys(props).find((key) => props[key]?.['x-component'] === 'ActionBar');
  if (!actionBarKey || !props[actionBarKey]?.properties) return;
  const actionBarProps = props[actionBarKey].properties;
  if (actionBarProps.syncFromDatabase) return;
  actionBarProps.syncFromDatabase = {
    type: 'void',
    'x-component': 'SyncCollectionsAction',
    'x-reactions': (field: any) => {
      const params = new URLSearchParams(window.location.search);
      const type = params.get('type');
      field.visible = EXTERNAL_TYPES.includes(type);
    },
  };
}

export class PluginDataSourceExternalClient extends Plugin {
  async load() {
    const dataSourceManager = this.app.pm.get('data-source-manager') as any;
    if (!dataSourceManager) {
      return;
    }

    // 全局注册同步按钮组件，使其在 SchemaComponent 树中可被 x-component 解析
    this.app.addComponents({ SyncCollectionsAction: CollectionsSyncAction });

    // 向 collectionTableSchema 的 ActionBar 注入同步按钮
    injectSyncActionIntoSchema();

    dataSourceManager.registerType('postgres', {
      label: '{{t("PostgreSQL", { ns: "data-source-external" })}}',
      DataSourceSettingsForm: ExternalDataSourceSettingsForm,
      DeleteCollection: ExternalDeleteCollection,
      allowCollectionCreate: true,
      allowCollectionDeletion: true,
      defaultValues: {
        options: {
          host: 'localhost',
          port: 5432,
          schema: 'public',
          ssl: { sslMode: 'disable' },
        },
      },
    });

    dataSourceManager.registerType('mysql', {
      label: '{{t("MySQL", { ns: "data-source-external" })}}',
      DataSourceSettingsForm: ExternalDataSourceSettingsForm,
      DeleteCollection: ExternalDeleteCollection,
      allowCollectionCreate: true,
      allowCollectionDeletion: true,
      defaultValues: {
        options: {
          host: 'localhost',
          port: 3306,
          ssl: { sslMode: 'disable' },
        },
      },
    });
  }
}

export default PluginDataSourceExternalClient;
