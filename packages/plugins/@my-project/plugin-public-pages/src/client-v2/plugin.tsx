/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin, Application } from '@nocobase/client-v2';
// @ts-ignore
import pkg from '../../package.json';
import zhCN from '../locale/zh-CN.json';
import enUS from '../locale/en-US.json';

export class PluginPublicPagesClientV2 extends Plugin<any, Application> {
  async load() {
    this.app.i18n.addResources('zh-CN', pkg.name, zhCN);
    this.app.i18n.addResources('en-US', pkg.name, enUS);

    this.pluginSettingsManager.addMenuItem({
      key: 'public-pages',
      icon: 'FileTextOutlined',
      title: this.t('Public Pages'),
    });
    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'public-pages',
      key: 'index',
      title: this.t('Public Pages'),
      componentLoader: () => import('./pages/PublicPagesPage'),
    });
  }
}

export default PluginPublicPagesClientV2;
