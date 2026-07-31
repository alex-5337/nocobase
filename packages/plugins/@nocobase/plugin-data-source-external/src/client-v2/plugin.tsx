/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Application, Plugin } from '@nocobase/client-v2';
import { tExpr } from './locale';
import { ExternalDataSourceSettingsForm } from './settings/ExternalDataSourceSettingsForm';

type DataSourceManagerPlugin = {
  registerType(name: string, options: Record<string, unknown>): void;
};

export class PluginDataSourceExternalClientV2 extends Plugin<any, Application> {
  async load() {
    const dataSourceManager = (this.app.pm.get('@nocobase/plugin-data-source-manager') ||
      this.app.pm.get('data-source-manager')) as DataSourceManagerPlugin | null;

    if (!dataSourceManager) {
      return;
    }

    dataSourceManager.registerType('postgres', {
      label: tExpr('PostgreSQL'),
      SettingsForm: ExternalDataSourceSettingsForm,
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
      label: tExpr('MySQL'),
      SettingsForm: ExternalDataSourceSettingsForm,
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

export default PluginDataSourceExternalClientV2;
