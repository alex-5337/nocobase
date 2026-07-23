/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin, i18n } from '@nocobase/client';
import { Schema } from '@formily/react';
import { ExternalDataSourceSettingsForm } from './settings/ExternalDataSourceSettingsForm';
import { CollectionsSyncAction } from './components/CollectionsSyncAction';
import { ExternalDeleteCollection } from './components/ExternalDeleteCollection';
import { collectionTableSchema } from '@nocobase/plugin-data-source-manager/client/component/CollectionsManager/schema/collections';

const EXTERNAL_TYPES = ['postgres', 'mysql'];

const compile = (source: string) => {
  return Schema.compile(source, { t: i18n.t });
};

/**
 * 从 collectionTableSchema 中找到 ActionBar 的 properties。
 */
function getActionBarProps(): Record<string, any> | null {
  const props = collectionTableSchema.properties as Record<string, any>;
  if (!props) return null;
  const actionBarKey = Object.keys(props).find((key) => props[key]?.['x-component'] === 'ActionBar');
  if (!actionBarKey || !props[actionBarKey]?.properties) return null;
  return props[actionBarKey].properties;
}

/**
 * 向 plugin-data-source-manager 的 collectionTableSchema ActionBar 中
 * 注入「从数据库同步」按钮，仅对外部数据源类型可见。
 * 这样无需修改 plugin-data-source-manager 的源码。
 */
function injectSyncActionIntoSchema() {
  const actionBarProps = getActionBarProps();
  if (!actionBarProps || actionBarProps.syncFromDatabase) return;
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

/**
 * 为外部数据源的「创建数据表」表单注入继承（inherits）功能所需的 scope。
 *
 * 官方 ConfigurationTable（CollectionsManager）的 scope 中：
 *   - 缺少 loadCollections 函数 → inherits 下拉框调用 undefined 永远 loading；
 *   - enableInherits 取的是主数据库方言 → 对外部数据源类型判断不正确。
 *
 * 此函数通过 collectionTableSchema 的 create 按钮 x-component-props.scope
 * 将正确的 loadCollections / enableInherits 传入 AddCollectionAction，
 * 无需修改 plugin-data-source-manager 源码。
 */
function patchCreateActionForInherits(app: any) {
  const actionBarProps = getActionBarProps();
  if (!actionBarProps?.create) return;

  const existingProps = actionBarProps.create['x-component-props'] || {};
  const scope: Record<string, any> = {
    ...existingProps.scope,
    /**
     * 加载当前外部数据源中已有的 collection 列表，供 inherits 下拉框使用。
     * 签名与 main 数据源 ConfigurationTable 中的 loadCollections 一致：
     *   (field, options, exclude?) => Promise<{label, value}[]>
     */
    loadCollections: async (field: any, options: any, exclude?: string[]) => {
      // 数据源 key 是路由参数：/admin/settings/data-source-manager/:name/collections
      const pathMatch = window.location.pathname.match(/data-source-manager\/([^/]+)\/collections/);
      const dataSourceKey = pathMatch?.[1];
      if (!dataSourceKey) return [];

      const apiClient = app.apiClient;
      const response = await apiClient.resource(`dataSources/${dataSourceKey}/collections`).list({
        pageSize: 200,
        filter: { 'hidden.$isFalsy': true },
      });
      const collections: any[] = response?.data?.data || [];
      const isFieldInherits = field.props?.name === 'inherits';

      return collections
        .filter((item: any) => {
          if (exclude?.includes(item.template)) return false;
          if (item.autoCreate && item.isThrough) return false;
          if (isFieldInherits && item.template === 'view') return false;
          return true;
        })
        .map((item: any) => ({
          label: compile(item.title) || item.name,
          value: item.name,
        }));
    },
  };

  /**
   * 仅 PostgreSQL 外部数据源支持表继承（INHERITS 是 PG 原生特性）。
   * 使用 getter 惰性求值：每次打开创建表单时根据当前 URL 中的 type 参数判断，
   * 而非在插件加载时固定（此时 URL 可能还没有 type 参数）。
   */
  Object.defineProperty(scope, 'enableInherits', {
    get() {
      const params = new URLSearchParams(window.location.search);
      return params.get('type') === 'postgres';
    },
    enumerable: true,
    configurable: true,
  });

  actionBarProps.create['x-component-props'] = {
    ...existingProps,
    scope,
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

    // 为创建数据表表单注入继承功能所需的 loadCollections / enableInherits
    patchCreateActionForInherits(this.app);

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
